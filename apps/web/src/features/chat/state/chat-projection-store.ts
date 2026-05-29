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
import { create } from 'zustand'

import {
  chatEventSummary,
  chatStreamItemSummary,
  chatThreadSnapshotSummary,
  logChatPipelineDebug,
  logChatPipelineInfo,
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
  threadDetailSequenceById: Record<ThreadId, number>
  threadIds: ThreadId[]
  threadIdsByProjectId: Record<ProjectId, ThreadId[]>
  threadSessionById: Record<ThreadId, OrchestrationSession | null>
  threadShellById: Record<ThreadId, ChatProjectionThreadShell>
  threadTurnStateById: Record<ThreadId, ChatProjectionThreadTurnState>
  turnDiffIdsByThreadId: Record<ThreadId, TurnId[]>
  turnDiffSummaryByThreadId: Record<ThreadId, Record<TurnId, ChatTurnDiffSummary>>
}

export type ChatProjectionActions = {
  applyOrchestrationEvent: (event: OrchestrationEvent) => void
  applyOrchestrationEvents: (events: ReadonlyArray<OrchestrationEvent>) => void
  applyShellStreamItem: (item: OrchestrationShellStreamItem) => void
  applyThreadStreamItem: (item: OrchestrationThreadStreamItem) => void
  resetChatProjection: () => void
  syncShellSnapshot: (snapshot: OrchestrationShellSnapshot) => void
  syncThreadDetailSnapshot: (snapshot: OrchestrationThreadDetailSnapshot) => void
}

export type ChatProjectionStore = ChatProjectionState & ChatProjectionActions

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
    logChatPipelineDebug('chat.projection.apply_event', chatEventSummary(event))
    set((state) => applyChatProjectionEvents(state, [event]))
  },
  applyOrchestrationEvents: (events) => {
    logChatPipelineDebug('chat.projection.apply_events', {
      eventCount: events.length,
      eventTypes: events.map((event) => event.type),
      maxSequence: events.at(-1)?.sequence ?? null,
    })
    set((state) => applyChatProjectionEvents(state, events))
  },
  applyShellStreamItem: (item) => {
    logChatPipelineDebug('chat.projection.apply_shell_stream_item', chatStreamItemSummary(item))
    set((state) => applyChatProjectionShellStreamItem(state, item))
  },
  applyThreadStreamItem: (item) => {
    logChatPipelineDebug('chat.projection.apply_thread_stream_item', chatStreamItemSummary(item))
    set((state) => applyChatProjectionThreadStreamItem(state, item))
  },
  resetChatProjection: () => {
    logChatPipelineInfo('chat.projection.reset')
    set(createInitialChatProjectionState())
  },
  syncShellSnapshot: (snapshot) => {
    logChatPipelineInfo('chat.projection.sync_shell_snapshot', {
      projectCount: snapshot.projects.length,
      snapshotSequence: snapshot.snapshotSequence,
      threadCount: snapshot.threads.length,
    })
    set((state) => syncChatProjectionShellSnapshot(state, snapshot))
  },
  syncThreadDetailSnapshot: (snapshot) => {
    logChatPipelineInfo('chat.projection.sync_thread_detail_snapshot', {
      ...chatThreadSnapshotSummary(snapshot),
    })
    set((state) => syncChatProjectionThreadDetailSnapshot(state, snapshot))
  },
}))
