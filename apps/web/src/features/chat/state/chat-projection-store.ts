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
} from '../lib/chat-pipeline-logging'
import {
  applyChatProjectionEvents,
  applyChatProjectionShellStreamItem,
  applyChatProjectionThreadStreamItem,
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
  | 'projectId'
  | 'session'
  | 'title'
  | 'updatedAt'
  | 'worktreePath'
>

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
    threadIds: [],
    threadIdsByProjectId: {},
    threadSessionById: {},
    threadShellById: {},
    threadTurnStateById: {},
    turnDiffIdsByThreadId: {},
    turnDiffSummaryByThreadId: {},
  }
}

export const useChatProjectionStore = create<ChatProjectionStore>((set) => ({
  ...createInitialChatProjectionState(),
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
