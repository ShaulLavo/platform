import type {
  OrchestrationThreadStreamItem,
  OrchestrationSession,
  ThreadId,
} from '@workspace/contracts'

import type { ChatEnvironment } from '../environment/chat-environment'
import { createLocalChatEnvironment } from '../environment/local-chat-environment'
import {
  MAX_CACHED_THREAD_DETAIL_SUBSCRIPTIONS,
  SIDEBAR_THREAD_DETAIL_PREWARM_LIMIT,
  THREAD_DETAIL_SUBSCRIPTION_IDLE_EVICTION_MS,
} from './chat-cache-constants'
import { useChatProjectionStore, type ChatProjectionStore } from './chat-projection-store'

type TimeoutHandle = number | ReturnType<typeof setTimeout>

type ChatProjectionStoreAccess = {
  getState: () => ChatProjectionStore
}

export type ThreadDetailSubscriptionSnapshot = {
  active: boolean
  hasEvictionTimer: boolean
  lastAccessedAt: number
  refCount: number
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

type ThreadDetailSubscriptionEntry = {
  abortController: AbortController | null
  active: boolean
  evictionTimeoutId: TimeoutHandle | null
  lastAccessedAt: number
  lastError: unknown
  refCount: number
  threadId: ThreadId
}

const NOOP = () => undefined

export function createThreadDetailSubscriptionCache(options: ThreadDetailSubscriptionCacheOptions) {
  const entries = new Map<ThreadId, ThreadDetailSubscriptionEntry>()
  const store = options.store ?? useChatProjectionStore
  const idleEvictionMs = options.idleEvictionMs ?? THREAD_DETAIL_SUBSCRIPTION_IDLE_EVICTION_MS
  const maxCachedSubscriptions =
    options.maxCachedSubscriptions ?? MAX_CACHED_THREAD_DETAIL_SUBSCRIPTIONS
  const now = options.now ?? Date.now
  const scheduleTimeout = options.scheduleTimeout ?? setTimeout
  const clearScheduledTimeout = options.clearScheduledTimeout ?? clearTimeout

  function retain(threadId: ThreadId) {
    const entry = getOrCreateEntry(threadId)
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
      reconcileEntryEviction(entry)
      evictIdleEntriesToCapacity()
    }
  }

  function prewarmSidebarThreadDetails(threadIds: ReadonlyArray<ThreadId>) {
    const releases = threadIds.slice(0, SIDEBAR_THREAD_DETAIL_PREWARM_LIMIT).map(retain)

    for (const release of releases) {
      release()
    }
  }

  function reconcileThread(threadId: ThreadId) {
    const entry = entries.get(threadId)
    if (!entry) return

    reconcileEntryEviction(entry)
    evictIdleEntriesToCapacity()
  }

  function reconcileAll() {
    for (const entry of entries.values()) {
      reconcileEntryEviction(entry)
    }

    evictIdleEntriesToCapacity()
  }

  function dispose(threadId: ThreadId) {
    return disposeEntry(threadId)
  }

  function disposeAll() {
    const threadIds = Array.from(entries.keys())

    for (const threadId of threadIds) {
      disposeEntry(threadId)
    }
  }

  function snapshot(): ThreadDetailSubscriptionSnapshot[] {
    return [...entries.values()].map((entry) => ({
      active: entry.active,
      hasEvictionTimer: entry.evictionTimeoutId !== null,
      lastAccessedAt: entry.lastAccessedAt,
      refCount: entry.refCount,
      threadId: entry.threadId,
    }))
  }

  function getOrCreateEntry(threadId: ThreadId) {
    const existing = entries.get(threadId)
    if (existing) return existing

    const entry: ThreadDetailSubscriptionEntry = {
      abortController: null,
      active: false,
      evictionTimeoutId: null,
      lastAccessedAt: now(),
      lastError: null,
      refCount: 0,
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

    void runThreadDetailSubscription(entry, abortController)
  }

  async function runThreadDetailSubscription(
    entry: ThreadDetailSubscriptionEntry,
    abortController: AbortController,
  ) {
    const afterSequence = store.getState().threadDetailSequenceById[entry.threadId] ?? 0

    try {
      for await (const item of options.environment.threadDetailStream(entry.threadId, {
        afterSequence,
        signal: abortController.signal,
      })) {
        applyThreadStreamItem(item)
      }
    } catch (error) {
      if (!abortController.signal.aborted) {
        entry.lastError = error
      }
    } finally {
      if (entry.abortController === abortController) {
        entry.abortController = null
        entry.active = false
      }
    }
  }

  function applyThreadStreamItem(item: OrchestrationThreadStreamItem) {
    if (item.kind === 'snapshot') {
      store.getState().syncThreadDetailSnapshot(item.snapshot)
      return
    }

    store.getState().applyOrchestrationEvent(item.event)
  }

  function clearEntryEviction(entry: ThreadDetailSubscriptionEntry) {
    if (entry.evictionTimeoutId === null) return

    clearScheduledTimeout(entry.evictionTimeoutId)
    entry.evictionTimeoutId = null
  }

  function reconcileEntryEviction(entry: ThreadDetailSubscriptionEntry) {
    clearEntryEviction(entry)
    if (!shouldEvictEntry(entry)) return

    entry.evictionTimeoutId = scheduleTimeout(() => {
      entry.evictionTimeoutId = null
      if (!shouldEvictEntry(entry)) return

      disposeEntry(entry.threadId)
    }, idleEvictionMs)
  }

  function evictIdleEntriesToCapacity() {
    if (entries.size <= maxCachedSubscriptions) return

    const idleEntries = [...entries.values()]
      .filter(shouldEvictEntry)
      .toSorted((left, right) => left.lastAccessedAt - right.lastAccessedAt)

    for (const entry of idleEntries) {
      if (entries.size <= maxCachedSubscriptions) return

      disposeEntry(entry.threadId)
    }
  }

  function shouldEvictEntry(entry: ThreadDetailSubscriptionEntry) {
    if (entry.refCount > 0) return false

    return !isProtectedThread(entry.threadId)
  }

  function isProtectedThread(threadId: ThreadId) {
    const state = store.getState()
    const summary = state.sidebarThreadSummaryById[threadId]

    if (summary?.hasActionableProposedPlan) return true
    if ((summary?.pendingApprovalCount ?? 0) > 0) return true
    if ((summary?.pendingUserInputCount ?? 0) > 0) return true
    if (summary?.latestTurn?.state === 'running') return true
    if (isBusySession(summary?.session ?? null)) return true

    const turnState = state.threadTurnStateById[threadId]
    if (turnState?.latestTurn?.state === 'running') return true
    if (turnState?.pendingSourceProposedPlan !== undefined) return true

    return isBusySession(state.threadSessionById[threadId] ?? null)
  }

  function disposeEntry(threadId: ThreadId) {
    const entry = entries.get(threadId)
    if (!entry) return false

    clearEntryEviction(entry)
    entries.delete(threadId)
    entry.abortController?.abort()
    entry.abortController = null
    entry.active = false

    return true
  }

  return {
    dispose,
    disposeAll,
    prewarmSidebarThreadDetails,
    reconcileAll,
    reconcileThread,
    retain,
    snapshot,
    size: () => entries.size,
  }
}

function isBusySession(session: OrchestrationSession | null) {
  if (!session) return false

  return session.status !== 'idle' && session.status !== 'stopped'
}

export const localThreadDetailSubscriptionCache = createThreadDetailSubscriptionCache({
  environment: createLocalChatEnvironment(),
  store: useChatProjectionStore,
})

export function retainThreadDetailSubscription(threadId: ThreadId) {
  return localThreadDetailSubscriptionCache.retain(threadId)
}

export function prewarmSidebarThreadDetails(threadIds: ReadonlyArray<ThreadId>) {
  localThreadDetailSubscriptionCache.prewarmSidebarThreadDetails(threadIds)
}

export function reconcileThreadDetailSubscription(threadId: ThreadId) {
  localThreadDetailSubscriptionCache.reconcileThread(threadId)
}

export function disposeThreadDetailSubscription(threadId: ThreadId) {
  return localThreadDetailSubscriptionCache.dispose(threadId)
}

export function disposeAllThreadDetailSubscriptions() {
  localThreadDetailSubscriptionCache.disposeAll()
}

export function noopThreadDetailRelease() {
  return NOOP
}
