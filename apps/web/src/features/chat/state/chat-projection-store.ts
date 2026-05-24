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
  turnId: TurnId
}

export type ChatThread = ChatProjectionThreadShell & {
  activities: OrchestrationThreadActivity[]
  latestTurn: OrchestrationLatestTurn | null
  messages: OrchestrationMessage[]
  pendingSourceProposedPlan?: OrchestrationLatestTurn['sourceProposedPlan']
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
  applyOrchestrationEvent: (event) => set((state) => applyChatProjectionEvents(state, [event])),
  applyOrchestrationEvents: (events) => set((state) => applyChatProjectionEvents(state, events)),
  applyShellStreamItem: (item) => set((state) => applyChatProjectionShellStreamItem(state, item)),
  applyThreadStreamItem: (item) => set((state) => applyChatProjectionThreadStreamItem(state, item)),
  resetChatProjection: () => set(createInitialChatProjectionState()),
  syncShellSnapshot: (snapshot) => set((state) => syncChatProjectionShellSnapshot(state, snapshot)),
  syncThreadDetailSnapshot: (snapshot) =>
    set((state) => syncChatProjectionThreadDetailSnapshot(state, snapshot)),
}))
