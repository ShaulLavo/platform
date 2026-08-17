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
  type OrchestrationSession,
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
import { Throttler } from '@tanstack/react-pacer/throttler'
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

export type ChatProjectionThreadShell = Pick<
  OrchestrationThreadShell,
  | 'archivedAt'
  | 'branch'
  | 'createdAt'
  | 'id'
  | 'interactionMode'
  | 'modelSelection'
  | 'projectId'
  | 'runtimeMode'
  | 'title'
  | 'updatedAt'
  | 'worktreePath'
>

/**
 * The metadata a thread detail snapshot carries about the thread itself. It is kept
 * apart from `threadShellById` because the shell and detail subscriptions run
 * independently: a detail cached before a reconnect can land after a newer shell
 * snapshot, and the shell is authoritative for branch/worktree/title/session.
 * `selectChatThreadById` merges the two shell-wins; nothing merges them in a write.
 */
export type ChatProjectionThreadDetailMeta = ChatProjectionThreadShell & {
  latestTurn: OrchestrationLatestTurn | null
  session: OrchestrationSession | null
}

export type ChatProjectionThreadTurnState = {
  latestTurn: OrchestrationLatestTurn | null
  pendingSourceProposedPlan?: OrchestrationLatestTurn['sourceProposedPlan']
}

export type ChatSidebarThreadSummary = Pick<
  OrchestrationThreadShell,
  | 'archivedAt'
  | 'branch'
  | 'createdAt'
  | 'hasActionableProposedPlan'
  | 'id'
  | 'interactionMode'
  | 'latestTurn'
  | 'latestUserMessageAt'
  | 'pendingApprovalCount'
  | 'pendingUserInputCount'
  | 'planProgress'
  | 'projectId'
  | 'session'
  | 'title'
  | 'updatedAt'
  | 'worktreePath'
> & {
  /**
   * The slot the user dragged this session into, `null` while it holds none.
   * Event-derived rather than shell-derived: the thread shell carries no pin
   * state, so the writers keep this field across a resnapshot themselves.
   */
  pinOrderKey?: string | null
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

export type ChatThread = ChatProjectionThreadShell & {
  activities: OrchestrationThreadActivity[]
  hasActionableProposedPlan: boolean
  latestTurn: OrchestrationLatestTurn | null
  latestUserMessageAt: string | null
  messages: OrchestrationMessage[]
  pendingApprovalCount: number
  pendingSourceProposedPlan?: OrchestrationLatestTurn['sourceProposedPlan']
  pendingUserInputCount: number
  proposedPlans: OrchestrationProposedPlan[]
  session: OrchestrationSession | null
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
  sidebarThreadSummaryById: Record<ThreadId, ChatSidebarThreadSummary>
  threadDetailMetaById: Record<ThreadId, ChatProjectionThreadDetailMeta>
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
  threadSessionById: Record<ThreadId, OrchestrationSession | null>
  threadShellById: Record<ThreadId, ChatProjectionThreadShell>
  threadTurnStateById: Record<ThreadId, ChatProjectionThreadTurnState>
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
    sidebarThreadSummaryById: {},
    threadDetailMetaById: {},
    threadDetailSequenceById: {},
    threadHasEarlierById: {},
    threadIds: [],
    threadIdsByProjectId: {},
    threadSessionById: {},
    threadShellById: {},
    threadTurnStateById: {},
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
const projectionPersist = new Throttler(flushChatProjectionCache, {
  leading: false,
  trailing: true,
  wait: CHAT_PROJECTION_CACHE_PERSIST_MS,
})

export function flushChatProjectionCache() {
  return writeChatProjectionCache(chatProjectionCacheFromState(useChatProjectionStore.getState()))
}

useChatProjectionStore.subscribe(() => {
  projectionPersist.maybeExecute()
})

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('beforeunload', () => {
    flushChatProjectionCache()
  })
}
