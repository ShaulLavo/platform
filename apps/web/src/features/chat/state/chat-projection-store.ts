import {
  type EnvironmentId,
  type WorktreeId,
  type OrchestrationWorktreeShell,
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
  type OrchestrationSessionActivity,
  type OrchestrationSessionDetailPage,
  type OrchestrationSessionDetailSnapshot,
  type OrchestrationSessionShell,
  type OrchestrationSessionStreamItem,
  type ProjectId,
  type ProposedPlanId,
  type SessionId,
  type TurnId,
} from '@workspace/contracts'
import { Debouncer } from '@tanstack/react-pacer/debouncer'
import { create } from 'zustand'

import {
  chatEventSummary,
  chatStreamItemSummary,
  chatSessionSnapshotSummary,
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
  applyChatProjectionSessionStreamItem,
  prependChatProjectionSessionDetailPage,
  syncChatProjectionShellSnapshot,
  syncChatProjectionSessionDetailSnapshot,
} from './chat-projection-writers'

export type ProjectionSession = OrchestrationSessionShell & {
  pinOrderKey: string | null
  detailSynced: boolean
  liveTurn: OrchestrationLatestTurn | null
  metaSource: 'shell' | 'detail'
  pendingSourceProposedPlan?: OrchestrationLatestTurn['sourceProposedPlan']
  runtimeKnown: boolean
}

export type ChatTurnDiffSummary = {
  assistantMessageId: MessageId | null
  checkpointRef: string
  checkpointTurnCount: number
  completedAt: string
  files: OrchestrationCheckpointFile[]
  status: OrchestrationCheckpointStatus
  sessionId: SessionId
  turnId: TurnId
}

/**
 * A session with its timelines attached — what the transcript renders. `latestTurn`
 * here is the *live* turn corrected for the session's terminal states, not the
 * shell-published one; `liveTurn` is therefore omitted rather than shipped alongside.
 */
export type ChatSession = Omit<ProjectionSession, 'liveTurn'> & {
  project: OrchestrationProjectShell
  worktree: OrchestrationWorktreeShell
  activities: OrchestrationSessionActivity[]
  messages: OrchestrationMessage[]
  proposedPlans: OrchestrationProposedPlan[]
  turnDiffSummaries: ChatTurnDiffSummary[]
}

export type ChatProjectionSlice = {
  activityBySessionId: Record<SessionId, Record<EventId, OrchestrationSessionActivity>>
  activityIdsBySessionId: Record<SessionId, EventId[]>
  bootstrapComplete: boolean
  lastAppliedShellSequence: number
  lastAppliedShellUpdatedAt: string | null
  messageBySessionId: Record<SessionId, Record<MessageId, OrchestrationMessage>>
  messageIdsBySessionId: Record<SessionId, MessageId[]>
  projectById: Record<ProjectId, OrchestrationProjectShell>
  projectIds: ProjectId[]
  worktreeById: Record<WorktreeId, OrchestrationWorktreeShell>
  worktreeIds: WorktreeId[]
  proposedPlanBySessionId: Record<SessionId, Record<ProposedPlanId, OrchestrationProposedPlan>>
  proposedPlanIdsBySessionId: Record<SessionId, ProposedPlanId[]>
  sessionById: Record<SessionId, ProjectionSession>
  /**
   * Whether older rows exist behind the oldest one currently held. An absent
   * entry means "not asked yet" and reads as `true`: the server's answer to the
   * first page request is what settles it, and a cap that trims the front puts
   * it back to `true` so trimmed history never becomes unreachable.
   */
  sessionHasEarlierById: Record<SessionId, boolean>
  sessionDetailSequenceById: Record<SessionId, number>
  sessionIds: SessionId[]
  turnDiffIdsBySessionId: Record<SessionId, TurnId[]>
  turnDiffSummaryBySessionId: Record<SessionId, Record<TurnId, ChatTurnDiffSummary>>
}

export type ChatProjectionState = {
  slices: Record<EnvironmentId, ChatProjectionSlice>
}

type ChatProjectionActions = {
  applyOrchestrationEvent(environmentId: EnvironmentId, event: OrchestrationEvent): void
  applyOrchestrationEvents(
    environmentId: EnvironmentId,
    events: readonly OrchestrationEvent[],
  ): void
  applyShellStreamItem(environmentId: EnvironmentId, item: OrchestrationShellStreamItem): void
  applySessionStreamItem(environmentId: EnvironmentId, item: OrchestrationSessionStreamItem): void
  prependSessionDetailPage(environmentId: EnvironmentId, page: OrchestrationSessionDetailPage): void
  dropEnvironment(environmentId: EnvironmentId): void
  resetChatProjection(): void
  syncShellSnapshot(environmentId: EnvironmentId, snapshot: OrchestrationShellSnapshot): void
  syncSessionDetailSnapshot(
    environmentId: EnvironmentId,
    snapshot: OrchestrationSessionDetailSnapshot,
  ): void
}

export type ChatProjectionStore = ChatProjectionState & ChatProjectionActions

const CHAT_PROJECTION_LOG_FLUSH_MS = 250

let projectionLogScope: ChatPipelineScope | null = null
const projectionLogFlush = new Debouncer(flushProjectionLogScope, {
  wait: CHAT_PROJECTION_LOG_FLUSH_MS,
})

export function createInitialChatProjectionSlice(): ChatProjectionSlice {
  return {
    activityBySessionId: {},
    activityIdsBySessionId: {},
    bootstrapComplete: false,
    lastAppliedShellSequence: 0,
    lastAppliedShellUpdatedAt: null,
    messageBySessionId: {},
    messageIdsBySessionId: {},
    projectById: {},
    projectIds: [],
    worktreeById: {},
    worktreeIds: [],
    proposedPlanBySessionId: {},
    proposedPlanIdsBySessionId: {},
    sessionById: {},
    sessionDetailSequenceById: {},
    sessionHasEarlierById: {},
    sessionIds: [],
    turnDiffIdsBySessionId: {},
    turnDiffSummaryBySessionId: {},
  }
}

export function createInitialChatProjectionState(): ChatProjectionState {
  return { slices: {} }
}

export function restoredChatProjectionState(): ChatProjectionState {
  return hydrateChatProjectionState(createInitialChatProjectionState(), readChatProjectionCache())
}

const EMPTY_SLICE = createInitialChatProjectionSlice()

export function selectChatProjectionSlice(
  state: ChatProjectionState,
  environmentId: EnvironmentId,
): ChatProjectionSlice {
  return state.slices[environmentId] ?? EMPTY_SLICE
}

function updateSlice(
  state: ChatProjectionState,
  environmentId: EnvironmentId,
  update: (slice: ChatProjectionSlice) => ChatProjectionSlice,
): ChatProjectionState {
  const previous = state.slices[environmentId] ?? createInitialChatProjectionSlice()
  const next = update(previous)
  if (next === previous && state.slices[environmentId]) return state
  return { slices: { ...state.slices, [environmentId]: next } }
}

export const useChatProjectionStore = create<ChatProjectionStore>((set) => ({
  ...restoredChatProjectionState(),
  applyOrchestrationEvent: (environmentId, event) => {
    recordProjectionMutation('applyEvent', { environmentId, ...chatEventSummary(event) })
    set((state) =>
      updateSlice(state, environmentId, (slice) => applyChatProjectionEvents(slice, [event])),
    )
  },
  applyOrchestrationEvents: (environmentId, events) => {
    recordProjectionMutation('applyEvents', { environmentId, eventCount: events.length })
    set((state) =>
      updateSlice(state, environmentId, (slice) => applyChatProjectionEvents(slice, events)),
    )
  },
  applyShellStreamItem: (environmentId, item) => {
    recordProjectionMutation('applyShellStreamItem', {
      environmentId,
      ...chatStreamItemSummary(item),
    })
    set((state) =>
      updateSlice(state, environmentId, (slice) => applyChatProjectionShellStreamItem(slice, item)),
    )
  },
  applySessionStreamItem: (environmentId, item) => {
    recordProjectionMutation('applySessionStreamItem', {
      environmentId,
      ...chatStreamItemSummary(item),
    })
    set((state) =>
      updateSlice(state, environmentId, (slice) =>
        applyChatProjectionSessionStreamItem(slice, item),
      ),
    )
  },
  prependSessionDetailPage: (environmentId, page) => {
    recordProjectionMutation('prependSessionDetailPage', {
      environmentId,
      sessionId: page.sessionId,
    })
    set((state) =>
      updateSlice(state, environmentId, (slice) =>
        prependChatProjectionSessionDetailPage(slice, page),
      ),
    )
  },
  dropEnvironment: (environmentId) =>
    set((state) => {
      const { [environmentId]: _removed, ...slices } = state.slices
      return { slices }
    }),
  resetChatProjection: () => set(createInitialChatProjectionState()),
  syncShellSnapshot: (environmentId, snapshot) => {
    recordProjectionMutation('syncShellSnapshot', {
      environmentId,
      snapshotSequence: snapshot.snapshotSequence,
    })
    set((state) =>
      updateSlice(state, environmentId, (slice) =>
        syncChatProjectionShellSnapshot(slice, snapshot),
      ),
    )
  },
  syncSessionDetailSnapshot: (environmentId, snapshot) => {
    recordProjectionMutation('syncSessionDetailSnapshot', {
      environmentId,
      ...chatSessionSnapshotSummary(snapshot),
    })
    set((state) =>
      updateSlice(state, environmentId, (slice) =>
        syncChatProjectionSessionDetailSnapshot(slice, snapshot),
      ),
    )
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
