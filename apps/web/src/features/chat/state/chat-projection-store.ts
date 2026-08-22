import {
  type EventId,
  type MessageId,
  type OrchestrationCheckpointFile,
  type OrchestrationCheckpointStatus,
  type OrchestrationEvent,
  type OrchestrationLatestTurn,
  type OrchestrationMessage,
  type OrchestrationProjectShell,
  type OrchestrationProposedPlan,
  type OrchestrationShellSnapshot,
  type OrchestrationShellStreamItem,
  type OrchestrationThreadActivity,
  type OrchestrationThreadDetailPage,
  type OrchestrationThreadDetailSnapshot,
  type OrchestrationThreadShell,
  type OrchestrationThreadStreamItem,
  type ProjectId,
  type ProposedPlanId,
  type ThreadId,
  type TurnId,
} from '@workspace/contracts'
import { Debouncer } from '@tanstack/react-pacer/debouncer'
import { create } from 'zustand'

import {
  chatEventSummary,
  chatStreamItemSummary,
  chatThreadSnapshotSummary,
  createChatPipelineScope,
  type ChatPipelineScope,
} from '@/features/chat/utils/pipeline-logging'
import { CHAT_PROJECTION_CACHE_PERSIST_MS } from './chat-cache-constants'
import {
  chatProjectionCacheFromState,
  hydrateChatProjectionState,
  readChatProjectionCache,
  writeChatProjectionCache,
} from './chat-projection-cache'
import {
  applyChatProjectionEvents,
  applyChatProjectionShellStreamItem,
  applyChatProjectionThreadStreamItem,
  prependChatProjectionThreadDetailPage,
  syncChatProjectionShellSnapshot,
  syncChatProjectionThreadDetailSnapshot,
} from './chat-projection-writers'

/**
 * One thread, as this client holds it. Two independent subscriptions produce it —
 * the shell stream (the rail's view of every thread) and the detail stream (the open
 * transcript) — and they can arrive in either order: a detail snapshot cached before
 * a reconnect can land *after* a newer shell one. The shell is authoritative, and
 * `metaSource` / `sessionKnown` are what make that true no matter which arrives last.
 * The rule used to live in the shape of the state (five records merged shell-first at
 * read time); it lives in `threadFromDetail` now, where the compiler can see it.
 */
export type ProjectionThread = Pick<
  OrchestrationThreadShell,
  | 'archivedAt'
  | 'branch'
  | 'createdAt'
  | 'hasActionableProposedPlan'
  | 'id'
  | 'interactionMode'
  | 'latestTurn'
  | 'latestUserMessageAt'
  | 'modelSelection'
  | 'pendingApprovalCount'
  | 'pendingUserInputCount'
  | 'planProgress'
  | 'projectId'
  | 'runtimeMode'
  | 'session'
  | 'title'
  | 'updatedAt'
  | 'worktreePath'
> & {
  /** A detail snapshot has landed for this thread; the cache uses it to pick transcripts. */
  detailSynced: boolean
  /**
   * `latestTurn` advanced by this client's own events since the last shell publish.
   * Deliberately *not* the same fact as `latestTurn`: the rail reports what the server
   * published (so a thread's dot does not flicker on every local event) while the open
   * transcript reports what this client has observed. Both are real; neither derives
   * from the other.
   */
  liveTurn: OrchestrationLatestTurn | null
  /** Which producer owns the meta group. `'shell'` wins and is never downgraded. */
  metaSource: 'shell' | 'detail'
  /** Carried by the turn that implements a proposed plan, cleared by the next turn. */
  pendingSourceProposedPlan?: OrchestrationLatestTurn['sourceProposedPlan']
  /**
   * The slot the user dragged this session into, `null` while it holds none.
   * Event-derived: the thread shell carries no pin state, so a resnapshot must
   * carry this field across itself.
   */
  pinOrderKey: string | null
  /**
   * An authoritative producer (shell snapshot, shell stream item, or a session
   * event) has published a session for this thread. `null` is a real session value
   * — "stopped" — so presence, not truthiness, is what lets a detail snapshot fill
   * in only for a thread nothing authoritative has spoken about yet.
   */
  sessionKnown: boolean
}

export type ChatTurnDiffSummary = {
  assistantMessageId: MessageId | null
  checkpointRef: string
  checkpointTurnCount: number
  completedAt: string
  files: OrchestrationCheckpointFile[]
  status: OrchestrationCheckpointStatus
  threadId: ThreadId
  turnId: TurnId
}

/**
 * A thread with its timelines attached — what the transcript renders. `latestTurn`
 * here is the *live* turn corrected for the session's terminal states, not the
 * shell-published one; `liveTurn` is therefore omitted rather than shipped alongside.
 */
export type ChatThread = Omit<ProjectionThread, 'liveTurn'> & {
  activities: OrchestrationThreadActivity[]
  messages: OrchestrationMessage[]
  proposedPlans: OrchestrationProposedPlan[]
  turnDiffSummaries: ChatTurnDiffSummary[]
}

export type ChatProjectionState = {
  activityByThreadId: Record<ThreadId, Record<EventId, OrchestrationThreadActivity>>
  activityIdsByThreadId: Record<ThreadId, EventId[]>
  bootstrapComplete: boolean
  lastAppliedShellSequence: number
  lastAppliedShellUpdatedAt: string | null
  messageByThreadId: Record<ThreadId, Record<MessageId, OrchestrationMessage>>
  messageIdsByThreadId: Record<ThreadId, MessageId[]>
  projectById: Record<ProjectId, OrchestrationProjectShell>
  projectIds: ProjectId[]
  proposedPlanByThreadId: Record<ThreadId, Record<ProposedPlanId, OrchestrationProposedPlan>>
  proposedPlanIdsByThreadId: Record<ThreadId, ProposedPlanId[]>
  threadById: Record<ThreadId, ProjectionThread>
  /**
   * Whether older rows exist behind the oldest one currently held. An absent
   * entry means "not asked yet" and reads as `true`: the server's answer to the
   * first page request is what settles it, and a cap that trims the front puts
   * it back to `true` so trimmed history never becomes unreachable.
   */
  threadHasEarlierById: Record<ThreadId, boolean>
  threadDetailSequenceById: Record<ThreadId, number>
  threadIds: ThreadId[]
  threadIdsByProjectId: Record<ProjectId, ThreadId[]>
  turnDiffIdsByThreadId: Record<ThreadId, TurnId[]>
  turnDiffSummaryByThreadId: Record<ThreadId, Record<TurnId, ChatTurnDiffSummary>>
}

type ChatProjectionActions = {
  applyOrchestrationEvent: (event: OrchestrationEvent) => void
  applyOrchestrationEvents: (events: ReadonlyArray<OrchestrationEvent>) => void
  applyShellStreamItem: (item: OrchestrationShellStreamItem) => void
  applyThreadStreamItem: (item: OrchestrationThreadStreamItem) => void
  prependThreadDetailPage: (page: OrchestrationThreadDetailPage) => void
  resetChatProjection: () => void
  syncShellSnapshot: (snapshot: OrchestrationShellSnapshot) => void
  syncThreadDetailSnapshot: (snapshot: OrchestrationThreadDetailSnapshot) => void
}

export type ChatProjectionStore = ChatProjectionState & ChatProjectionActions

const CHAT_PROJECTION_LOG_FLUSH_MS = 250

let projectionLogScope: ChatPipelineScope | null = null
const projectionLogFlush = new Debouncer(flushProjectionLogScope, {
  wait: CHAT_PROJECTION_LOG_FLUSH_MS,
})

export function createInitialChatProjectionState(): ChatProjectionState {
  return {
    activityByThreadId: {},
    activityIdsByThreadId: {},
    bootstrapComplete: false,
    lastAppliedShellSequence: 0,
    lastAppliedShellUpdatedAt: null,
    messageByThreadId: {},
    messageIdsByThreadId: {},
    projectById: {},
    projectIds: [],
    proposedPlanByThreadId: {},
    proposedPlanIdsByThreadId: {},
    threadById: {},
    threadDetailSequenceById: {},
    threadHasEarlierById: {},
    threadIds: [],
    threadIdsByProjectId: {},
    turnDiffIdsByThreadId: {},
    turnDiffSummaryByThreadId: {},
  }
}

/**
 * The socket takes a moment to connect on a cold load, and until it does the
 * store is the only thing the sidebar and the open transcript can read. Starting
 * from the cached snapshot paints them immediately; the sequence cursors stay at
 * zero so the first served snapshot outranks the cache and replaces it.
 */
export function restoredChatProjectionState(): ChatProjectionState {
  return hydrateChatProjectionState(createInitialChatProjectionState(), readChatProjectionCache())
}

export const useChatProjectionStore = create<ChatProjectionStore>((set) => ({
  ...restoredChatProjectionState(),
  applyOrchestrationEvent: (event) => {
    recordProjectionMutation('applyEvent', chatEventSummary(event))
    set((state) => applyChatProjectionEvents(state, [event]))
  },
  applyOrchestrationEvents: (events) => {
    recordProjectionMutation('applyEvents', {
      eventCount: events.length,
      eventTypes: events.map((event) => event.type),
      maxSequence: events.at(-1)?.sequence ?? null,
    })
    set((state) => applyChatProjectionEvents(state, events))
  },
  applyShellStreamItem: (item) => {
    recordProjectionMutation('applyShellStreamItem', chatStreamItemSummary(item))
    set((state) => applyChatProjectionShellStreamItem(state, item))
  },
  applyThreadStreamItem: (item) => {
    recordProjectionMutation('applyThreadStreamItem', chatStreamItemSummary(item))
    set((state) => applyChatProjectionThreadStreamItem(state, item))
  },
  prependThreadDetailPage: (page) => {
    recordProjectionMutation('prependThreadDetailPage', {
      activityCount: page.activities.length,
      hasEarlier: page.hasEarlier,
      messageCount: page.messages.length,
      threadId: page.threadId,
    })
    set((state) => prependChatProjectionThreadDetailPage(state, page))
  },
  resetChatProjection: () => {
    recordProjectionMutation('reset')
    set(createInitialChatProjectionState())
  },
  syncShellSnapshot: (snapshot) => {
    recordProjectionMutation('syncShellSnapshot', {
      projectCount: snapshot.projects.length,
      snapshotSequence: snapshot.snapshotSequence,
      threadCount: snapshot.threads.length,
    })
    set((state) => syncChatProjectionShellSnapshot(state, snapshot))
  },
  syncThreadDetailSnapshot: (snapshot) => {
    recordProjectionMutation('syncThreadDetailSnapshot', {
      ...chatThreadSnapshotSummary(snapshot),
      checkpointCount: snapshot.checkpoints.length,
      proposedPlanCount: snapshot.proposedPlans.length,
    })
    set((state) => syncChatProjectionThreadDetailSnapshot(state, snapshot))
  },
}))

function recordProjectionMutation(kind: string, context: Record<string, unknown> = {}) {
  const scope = currentProjectionLogScope()
  scope.increment('projection.mutationCount')
  scope.increment(`projection.${kind}Count`)
  scope.set({
    projection: {
      latest: {
        kind,
        ...context,
      },
    },
  })
  projectionLogFlush.maybeExecute()
}

function currentProjectionLogScope() {
  if (projectionLogScope) return projectionLogScope

  projectionLogScope = createChatPipelineScope('chat.projection.summary')
  return projectionLogScope
}

function flushProjectionLogScope() {
  const scope = projectionLogScope
  projectionLogScope = null
  scope?.end()
}

/**
 * Throttled rather than debounced: a streaming turn mutates the projection
 * faster than any debounce window closes, so a debounce would never write until
 * the turn ended. Leading edge is off so the write costs one serialization per
 * window instead of one per burst start.
 */
let projectionPersistTimer: ReturnType<typeof setTimeout> | null = null

export function flushChatProjectionCache() {
  return writeChatProjectionCache(chatProjectionCacheFromState(useChatProjectionStore.getState()))
}

useChatProjectionStore.subscribe(() => {
  scheduleChatProjectionCachePersist()
})

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('beforeunload', () => {
    flushChatProjectionCache()
  })
}

function scheduleChatProjectionCachePersist() {
  if (projectionPersistTimer) return

  projectionPersistTimer = setTimeout(persistChatProjectionCache, CHAT_PROJECTION_CACHE_PERSIST_MS)
}

function persistChatProjectionCache() {
  projectionPersistTimer = null
  flushChatProjectionCache()
}
