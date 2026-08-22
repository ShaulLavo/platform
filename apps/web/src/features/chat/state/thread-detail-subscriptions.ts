import type {
  OrchestrationThreadStreamItem,
  OrchestrationSession,
  ThreadId,
} from '@workspace/contracts'

import { errorMessage } from '@/lib/error-message'
import type { ChatEnvironment } from '../environment/chat-environment'
import { createLocalChatEnvironment } from '../environment/local-chat-environment'
import {
  chatStreamItemSummary,
  createChatPipelineScope,
  type ChatPipelineScope,
} from '@/features/chat/utils/pipeline-logging'
import { isBlockedStreamError, streamReconnectDelayMs } from '../utils/stream-reconnect'
import {
  MAX_CACHED_THREAD_DETAIL_SUBSCRIPTIONS,
  THREAD_DETAIL_SUBSCRIPTION_IDLE_EVICTION_MS,
} from './chat-cache-constants'
import { useChatProjectionStore, type ChatProjectionStore } from './chat-projection-store'
import {
  useThreadDetailSyncStore,
  type ThreadDetailSyncState,
  type ThreadDetailSyncStatus,
} from './thread-detail-sync-store'

type TimeoutHandle = number | ReturnType<typeof setTimeout>

type ChatProjectionStoreAccess = {
  getState: () => ChatProjectionStore
  subscribe?: (listener: (state: ChatProjectionStore) => void) => () => void
}

type DisposeReason = 'capacity' | 'deleted' | 'idle' | 'shutdown'

export type ThreadDetailSubscriptionSnapshot = {
  active: boolean
  attempt: number
  error: string | null
  hasEvictionTimer: boolean
  lastAccessedAt: number
  refCount: number
  status: ThreadDetailSyncStatus
  threadId: ThreadId
}

export type ThreadDetailSubscriptionCacheOptions = {
  clearScheduledTimeout?: (handle: TimeoutHandle) => void
  environment: ChatEnvironment
  idleEvictionMs?: number
  maxCachedSubscriptions?: number
  now?: () => number
  scheduleTimeout?: (callback: () => void, delay: number) => TimeoutHandle
  store?: ChatProjectionStoreAccess
}

type ThreadDetailStreamOutcome = {
  blocked: boolean
  error: string | null
}

type ThreadDetailSubscriptionEntry = {
  abortController: AbortController | null
  active: boolean
  evictionTimeoutId: TimeoutHandle | null
  failureCount: number
  lastAccessedAt: number
  /** True once the thread has been seen in the projection, so a later absence means deletion. */
  observedInProjection: boolean
  refCount: number
  scope: ChatPipelineScope
  sync: ThreadDetailSyncState
  threadId: ThreadId
}

const IDLE_SYNC: ThreadDetailSyncState = { attempt: 0, error: null, status: 'idle' }
const THREAD_DETAIL_STREAM_FAILED = 'Thread sync failed.'

export function createThreadDetailSubscriptionCache(options: ThreadDetailSubscriptionCacheOptions) {
  const entries = new Map<ThreadId, ThreadDetailSubscriptionEntry>()
  const store = options.store ?? useChatProjectionStore
  const idleEvictionMs = options.idleEvictionMs ?? THREAD_DETAIL_SUBSCRIPTION_IDLE_EVICTION_MS
  const maxCachedSubscriptions =
    options.maxCachedSubscriptions ?? MAX_CACHED_THREAD_DETAIL_SUBSCRIPTIONS
  const now = options.now ?? Date.now
  const scheduleTimeout = options.scheduleTimeout ?? setTimeout
  const clearScheduledTimeout = options.clearScheduledTimeout ?? clearTimeout
  const unsubscribeProjection = store.subscribe?.(handleProjectionChange) ?? null

  function retain(threadId: ThreadId) {
    const entry = getOrCreateEntry(threadId)
    entry.scope.increment('subscription.retainCount')
    entry.scope.set({
      refCount: entry.refCount + 1,
    })
    clearEntryEviction(entry)
    entry.refCount += 1
    entry.lastAccessedAt = now()
    startThreadDetailSubscription(entry)
    evictIdleEntriesToCapacity()

    let released = false

    return () => {
      if (released) return

      released = true
      entry.refCount = Math.max(0, entry.refCount - 1)
      entry.lastAccessedAt = now()
      entry.scope.increment('subscription.releaseCount')
      entry.scope.set({
        refCount: entry.refCount,
      })
      reconcileEntryEviction(entry)
      evictIdleEntriesToCapacity()
    }
  }

  function reconcileAll() {
    for (const entry of entries.values()) {
      reconcileEntryEviction(entry)
    }

    evictIdleEntriesToCapacity()
  }

  function disposeAll() {
    const threadIds = Array.from(entries.keys())

    for (const threadId of threadIds) {
      disposeEntry(threadId, 'shutdown')
    }

    unsubscribeProjection?.()
  }

  function snapshot(): ThreadDetailSubscriptionSnapshot[] {
    return [...entries.values()].map((entry) => ({
      active: entry.active,
      attempt: entry.sync.attempt,
      error: entry.sync.error,
      hasEvictionTimer: entry.evictionTimeoutId !== null,
      lastAccessedAt: entry.lastAccessedAt,
      refCount: entry.refCount,
      status: entry.sync.status,
      threadId: entry.threadId,
    }))
  }

  /**
   * The projection is the client's source of truth for which threads exist, so a
   * thread that leaves it has been deleted: its stream and wide-event scope die
   * with it. Every other change can flip an entry's eviction protection, so the
   * eviction timers are reconciled on the same tick.
   */
  function handleProjectionChange(state: ChatProjectionStore) {
    // Copied: disposing a deleted thread mutates `entries` mid-iteration.
    for (const entry of Array.from(entries.values())) {
      if (state.threadById[entry.threadId]?.metaSource === 'shell') {
        entry.observedInProjection = true
        continue
      }
      if (!entry.observedInProjection) continue

      disposeEntry(entry.threadId, 'deleted')
    }

    reconcileAll()
  }

  function getOrCreateEntry(threadId: ThreadId) {
    const existing = entries.get(threadId)
    if (existing) return existing

    const entry: ThreadDetailSubscriptionEntry = {
      abortController: null,
      active: false,
      evictionTimeoutId: null,
      failureCount: 0,
      lastAccessedAt: now(),
      observedInProjection: store.getState().threadById[threadId]?.metaSource === 'shell',
      refCount: 0,
      scope: createChatPipelineScope('chat.thread_detail_subscription.summary', { threadId }),
      sync: IDLE_SYNC,
      threadId,
    }

    entries.set(threadId, entry)

    return entry
  }

  function startThreadDetailSubscription(entry: ThreadDetailSubscriptionEntry) {
    if (entry.abortController !== null) return

    const abortController = new AbortController()
    entry.abortController = abortController
    entry.active = true
    entry.failureCount = 0
    entry.scope.increment('subscription.startCount')
    entry.scope.set({
      refCount: entry.refCount,
    })

    void superviseThreadDetailStream(entry, abortController)
  }

  /**
   * A single `for await` dies for good on the first transport error, which froze
   * open conversations mid-turn after every server restart. Each attempt is
   * re-armed here instead, resuming from the sequence the projection already
   * applied so a reconnect replays the gap rather than the whole thread.
   */
  async function superviseThreadDetailStream(
    entry: ThreadDetailSubscriptionEntry,
    abortController: AbortController,
  ) {
    const signal = abortController.signal

    while (!signal.aborted) {
      const outcome = await runThreadDetailStreamOnce(entry, signal)
      if (signal.aborted) break
      if (outcome.blocked) {
        publishSync(entry, { attempt: entry.failureCount, error: outcome.error, status: 'blocked' })
        break
      }

      entry.failureCount += 1
      const delayMs = streamReconnectDelayMs(entry.failureCount)
      entry.scope.increment('stream.reconnectCount')
      entry.scope.set({
        reconnect: { delayMs, failureCount: entry.failureCount },
      })
      publishSync(entry, {
        attempt: entry.failureCount,
        error: outcome.error,
        status: 'reconnecting',
      })
      await waitBeforeReconnect(delayMs, signal)
    }

    finishThreadDetailSubscription(entry, abortController)
  }

  async function runThreadDetailStreamOnce(
    entry: ThreadDetailSubscriptionEntry,
    signal: AbortSignal,
  ): Promise<ThreadDetailStreamOutcome> {
    const afterSequence = store.getState().threadDetailSequenceById[entry.threadId] ?? 0
    entry.scope.increment('stream.openCount')
    entry.scope.set({
      afterSequence,
    })
    publishSync(entry, {
      attempt: entry.failureCount,
      error: entry.sync.error,
      status: connectingStatus(entry),
    })

    try {
      for await (const item of options.environment.threadDetailStream(entry.threadId, {
        afterSequence,
        signal,
      })) {
        markThreadDetailStreamLive(entry)
        applyThreadStreamItem(entry, item)
      }

      return { blocked: false, error: null }
    } catch (error) {
      if (signal.aborted) return { blocked: false, error: null }

      entry.scope.increment('stream.errorCount')
      entry.scope.warn('Thread detail stream failed.', {
        afterSequence,
        error,
      })

      return {
        blocked: isBlockedStreamError(error),
        error: errorMessage(error, THREAD_DETAIL_STREAM_FAILED),
      }
    } finally {
      entry.scope.increment('stream.closeCount')
    }
  }

  function finishThreadDetailSubscription(
    entry: ThreadDetailSubscriptionEntry,
    abortController: AbortController,
  ) {
    if (entry.abortController !== abortController) return

    entry.abortController = null
    entry.active = false
    entry.scope.set({
      aborted: abortController.signal.aborted,
    })
  }

  function markThreadDetailStreamLive(entry: ThreadDetailSubscriptionEntry) {
    entry.failureCount = 0
    if (entry.sync.status === 'live') return

    publishSync(entry, { attempt: 0, error: null, status: 'live' })
  }

  function waitBeforeReconnect(delayMs: number, signal: AbortSignal) {
    return new Promise<void>((resolve) => {
      const settle = () => {
        signal.removeEventListener('abort', onAbort)
        clearScheduledTimeout(timeoutId)
        resolve()
      }
      const onAbort = () => settle()
      const timeoutId = scheduleTimeout(settle, delayMs)

      signal.addEventListener('abort', onAbort, { once: true })
    })
  }

  function applyThreadStreamItem(
    entry: ThreadDetailSubscriptionEntry,
    item: OrchestrationThreadStreamItem,
  ) {
    // Stream traffic is access: without it the LRU ordered by retain time alone
    // would evict the busiest thread first.
    entry.lastAccessedAt = now()
    entry.scope.increment('stream.itemCount')
    entry.scope.set({
      stream: {
        latestItem: chatStreamItemSummary(item),
      },
    })
    if (item.kind === 'snapshot') {
      store.getState().syncThreadDetailSnapshot(item.snapshot)
      return
    }

    store.getState().applyOrchestrationEvent(item.event)
  }

  function publishSync(entry: ThreadDetailSubscriptionEntry, sync: ThreadDetailSyncState) {
    entry.sync = sync
    useThreadDetailSyncStore.getState().setThreadDetailSync(entry.threadId, sync)
  }

  function clearEntryEviction(entry: ThreadDetailSubscriptionEntry) {
    if (entry.evictionTimeoutId === null) return

    clearScheduledTimeout(entry.evictionTimeoutId)
    entry.evictionTimeoutId = null
  }

  function reconcileEntryEviction(entry: ThreadDetailSubscriptionEntry) {
    if (!shouldEvictEntry(entry)) {
      clearEntryEviction(entry)
      return
    }
    // Never restart a running countdown: reconciliation runs on every projection
    // mutation, and re-arming there would push idle eviction out forever.
    if (entry.evictionTimeoutId !== null) return

    entry.evictionTimeoutId = scheduleTimeout(() => {
      entry.evictionTimeoutId = null
      if (!shouldEvictEntry(entry)) return

      disposeEntry(entry.threadId, 'idle')
    }, idleEvictionMs)
  }

  function evictIdleEntriesToCapacity() {
    if (entries.size <= maxCachedSubscriptions) return

    const idleEntries = [...entries.values()]
      .filter(shouldEvictEntry)
      .toSorted((left, right) => left.lastAccessedAt - right.lastAccessedAt)

    for (const entry of idleEntries) {
      if (entries.size <= maxCachedSubscriptions) return

      disposeEntry(entry.threadId, 'capacity')
    }
  }

  function shouldEvictEntry(entry: ThreadDetailSubscriptionEntry) {
    if (entry.refCount > 0) return false

    return !isProtectedThread(entry.threadId)
  }

  function isProtectedThread(threadId: ThreadId) {
    const thread = store.getState().threadById[threadId]
    if (!thread) return false
    if (thread.hasActionableProposedPlan) return true
    if (thread.pendingApprovalCount > 0) return true
    if (thread.pendingUserInputCount > 0) return true
    if (thread.latestTurn?.state === 'running') return true
    if (thread.liveTurn?.state === 'running') return true
    if (thread.pendingSourceProposedPlan !== undefined) return true

    return isBusySession(thread.session)
  }

  function disposeEntry(threadId: ThreadId, reason: DisposeReason) {
    const entry = entries.get(threadId)
    if (!entry) return false

    clearEntryEviction(entry)
    entries.delete(threadId)
    const wasActive = entry.abortController !== null
    entry.abortController?.abort()
    entry.abortController = null
    entry.active = false
    entry.sync = IDLE_SYNC
    useThreadDetailSyncStore.getState().clearThreadDetailSync(threadId)
    entry.scope.increment('subscription.disposeCount')
    entry.scope.end({ aborted: wasActive, disposeReason: reason, refCount: entry.refCount })

    return true
  }

  return {
    disposeAll,
    retain,
    snapshot,
    size: () => entries.size,
  }
}

function connectingStatus(entry: ThreadDetailSubscriptionEntry): ThreadDetailSyncStatus {
  if (entry.failureCount === 0) return 'connecting'

  return 'reconnecting'
}

function isBusySession(session: OrchestrationSession | null) {
  if (!session) return false

  return session.status !== 'idle' && session.status !== 'stopped'
}

const localThreadDetailSubscriptionCache = createThreadDetailSubscriptionCache({
  environment: createLocalChatEnvironment(),
  store: useChatProjectionStore,
})

export function retainThreadDetailSubscription(threadId: ThreadId) {
  return localThreadDetailSubscriptionCache.retain(threadId)
}
