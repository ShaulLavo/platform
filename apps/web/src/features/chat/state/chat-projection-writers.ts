import {
  DEFAULT_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  type OrchestrationEvent,
  type OrchestrationLatestTurn,
  type OrchestrationMessage,
  type OrchestrationProjectShell,
  type OrchestrationProposedPlan,
  type OrchestrationSession,
  type OrchestrationShellSnapshot,
  type OrchestrationShellStreamItem,
  type OrchestrationThread,
  type OrchestrationThreadActivity,
  type OrchestrationThreadDetailSnapshot,
  type OrchestrationThreadShell,
  type OrchestrationThreadStreamItem,
  type ProjectId,
  type ThreadId,
  type TurnId,
} from '@workspace/contracts'

import {
  CHAT_ACTIVITY_CACHE_LIMIT,
  CHAT_CHECKPOINT_CACHE_LIMIT,
  CHAT_MESSAGE_CACHE_LIMIT,
  CHAT_PROPOSED_PLAN_CACHE_LIMIT,
} from './chat-cache-constants'
import type {
  ChatProjectionState,
  ChatProjectionThreadShell,
  ChatProjectionThreadTurnState,
  ChatSidebarThreadSummary,
  ChatTurnDiffSummary,
} from './chat-projection-store'

const EMPTY_THREAD_IDS: ThreadId[] = []
type ThreadOrchestrationEvent = Extract<OrchestrationEvent, { type: `thread.${string}` }>
type ProjectOrchestrationEvent = Extract<OrchestrationEvent, { type: `project.${string}` }>

export function syncChatProjectionShellSnapshot(
  state: ChatProjectionState,
  snapshot: OrchestrationShellSnapshot,
): ChatProjectionState {
  if (!shouldApplyShellSnapshot(state, snapshot)) return state

  const nextThreadIds = new Set(snapshot.threads.map((thread) => thread.id))
  let nextState: ChatProjectionState = {
    ...state,
    ...projectStateFromShell(snapshot.projects),
    activityByThreadId: retainThreadScopedRecord(state.activityByThreadId, nextThreadIds),
    activityIdsByThreadId: retainThreadScopedRecord(state.activityIdsByThreadId, nextThreadIds),
    bootstrapComplete: true,
    lastAppliedShellSequence: snapshot.snapshotSequence,
    lastAppliedShellUpdatedAt: snapshot.updatedAt,
    messageByThreadId: retainThreadScopedRecord(state.messageByThreadId, nextThreadIds),
    messageIdsByThreadId: retainThreadScopedRecord(state.messageIdsByThreadId, nextThreadIds),
    proposedPlanByThreadId: retainThreadScopedRecord(state.proposedPlanByThreadId, nextThreadIds),
    proposedPlanIdsByThreadId: retainThreadScopedRecord(
      state.proposedPlanIdsByThreadId,
      nextThreadIds,
    ),
    sidebarThreadSummaryById: {},
    threadDetailSequenceById: retainThreadScopedRecord(
      state.threadDetailSequenceById,
      nextThreadIds,
    ),
    threadIds: [],
    threadIdsByProjectId: {},
    threadSessionById: {},
    threadShellById: {},
    threadTurnStateById: {},
    turnDiffIdsByThreadId: retainThreadScopedRecord(state.turnDiffIdsByThreadId, nextThreadIds),
    turnDiffSummaryByThreadId: retainThreadScopedRecord(
      state.turnDiffSummaryByThreadId,
      nextThreadIds,
    ),
  }

  for (const thread of snapshot.threads) {
    nextState = writeThreadShellState(nextState, thread)
  }

  return nextState
}

export function syncChatProjectionThreadDetailSnapshot(
  state: ChatProjectionState,
  snapshot: OrchestrationThreadDetailSnapshot,
): ChatProjectionState {
  const threadId = snapshot.thread.id
  if (!shouldApplyThreadDetailSnapshot(state, threadId, snapshot.snapshotSequence)) return state

  const nextState = writeThreadDetailState(state, snapshot.thread)

  return markThreadSequence(nextState, threadId, snapshot.snapshotSequence)
}

export function applyChatProjectionShellStreamItem(
  state: ChatProjectionState,
  item: OrchestrationShellStreamItem,
): ChatProjectionState {
  if (item.kind === 'snapshot') return syncChatProjectionShellSnapshot(state, item.snapshot)
  if (!shouldApplyShellSequence(state, item.sequence)) return state

  const nextState = applyFreshShellStreamItem(state, item)

  return markShellSequence(nextState, item.sequence)
}

export function applyChatProjectionThreadStreamItem(
  state: ChatProjectionState,
  item: OrchestrationThreadStreamItem,
): ChatProjectionState {
  if (item.kind === 'snapshot') return syncChatProjectionThreadDetailSnapshot(state, item.snapshot)

  return applyChatProjectionEvent(state, item.event)
}

export function applyChatProjectionEvents(
  state: ChatProjectionState,
  events: ReadonlyArray<OrchestrationEvent>,
): ChatProjectionState {
  let nextState = state

  for (const event of events) {
    nextState = applyChatProjectionEvent(nextState, event)
  }

  return nextState
}

export function applyChatProjectionEvent(
  state: ChatProjectionState,
  event: OrchestrationEvent,
): ChatProjectionState {
  if (isThreadOrchestrationEvent(event)) {
    return applyThreadEventWithSequenceGuard(state, event)
  }

  return applyProjectEvent(state, event)
}

function isThreadOrchestrationEvent(event: OrchestrationEvent): event is ThreadOrchestrationEvent {
  return event.type.startsWith('thread.')
}

function shouldApplyShellSnapshot(
  state: ChatProjectionState,
  snapshot: OrchestrationShellSnapshot,
) {
  if (snapshot.snapshotSequence > state.lastAppliedShellSequence) return true
  if (snapshot.snapshotSequence < state.lastAppliedShellSequence) return false

  const previousUpdatedAt = state.lastAppliedShellUpdatedAt ?? ''

  return snapshot.updatedAt > previousUpdatedAt
}

function shouldApplyShellSequence(state: ChatProjectionState, sequence: number) {
  return sequence > state.lastAppliedShellSequence
}

function shouldApplyThreadSequence(
  state: ChatProjectionState,
  threadId: ThreadId,
  sequence: number,
) {
  return sequence > (state.threadDetailSequenceById[threadId] ?? 0)
}

function shouldApplyThreadDetailSnapshot(
  state: ChatProjectionState,
  threadId: ThreadId,
  sequence: number,
) {
  const currentSequence = state.threadDetailSequenceById[threadId] ?? 0
  if (sequence > currentSequence) return true

  return sequence === currentSequence
}

function markShellSequence(state: ChatProjectionState, sequence: number): ChatProjectionState {
  if (sequence <= state.lastAppliedShellSequence) return state

  return {
    ...state,
    lastAppliedShellSequence: sequence,
  }
}

function markThreadSequence(
  state: ChatProjectionState,
  threadId: ThreadId,
  sequence: number,
): ChatProjectionState {
  if (!shouldApplyThreadSequence(state, threadId, sequence)) return state

  return {
    ...state,
    threadDetailSequenceById: {
      ...state.threadDetailSequenceById,
      [threadId]: sequence,
    },
  }
}

function applyFreshShellStreamItem(
  state: ChatProjectionState,
  item: Exclude<OrchestrationShellStreamItem, { kind: 'snapshot' }>,
): ChatProjectionState {
  switch (item.kind) {
    case 'project-upserted':
      return writeProject(state, item.project)
    case 'project-removed':
      return removeProject(state, item.projectId)
    case 'thread-upserted':
      return writeThreadShellState(state, item.thread)
    case 'thread-removed':
      return removeThreadState(state, item.threadId)
  }
}

function applyProjectEvent(
  state: ChatProjectionState,
  event: ProjectOrchestrationEvent,
): ChatProjectionState {
  switch (event.type) {
    case 'project.created':
      return writeProject(state, {
        createdAt: event.payload.createdAt,
        defaultModelSelection: event.payload.defaultModelSelection,
        id: event.payload.projectId,
        title: event.payload.title,
        updatedAt: event.payload.updatedAt,
        workspaceRoot: event.payload.workspaceRoot,
      })
    case 'project.meta-updated':
      return patchProject(state, event.payload.projectId, {
        defaultModelSelection: event.payload.defaultModelSelection,
        title: event.payload.title,
        updatedAt: event.payload.updatedAt,
        workspaceRoot: event.payload.workspaceRoot,
      })
    case 'project.deleted':
      return removeProject(state, event.payload.projectId)
    default:
      return state
  }
}

function applyThreadEventWithSequenceGuard(
  state: ChatProjectionState,
  event: ThreadOrchestrationEvent,
): ChatProjectionState {
  const threadId = event.payload.threadId
  if (!shouldApplyThreadSequence(state, threadId, event.sequence)) return state

  const nextState = applyFreshThreadEvent(state, event)

  return markThreadSequence(nextState, threadId, event.sequence)
}

function applyFreshThreadEvent(
  state: ChatProjectionState,
  event: ThreadOrchestrationEvent,
): ChatProjectionState {
  switch (event.type) {
    case 'thread.created':
      return writeCreatedThread(state, event)
    case 'thread.deleted':
      return removeThreadState(state, event.payload.threadId)
    case 'thread.archived':
      return patchThreadShellAndSummary(state, event.payload.threadId, {
        archivedAt: event.payload.archivedAt,
        updatedAt: event.payload.updatedAt,
      })
    case 'thread.unarchived':
      return patchThreadShellAndSummary(state, event.payload.threadId, {
        archivedAt: null,
        updatedAt: event.payload.updatedAt,
      })
    case 'thread.meta-updated':
      return applyThreadMetaUpdatedEvent(state, event)
    case 'thread.runtime-mode-set':
      return patchThreadShellAndSummary(state, event.payload.threadId, {
        runtimeMode: event.payload.runtimeMode,
        updatedAt: event.payload.updatedAt,
      })
    case 'thread.interaction-mode-set':
      return patchThreadShellAndSummary(state, event.payload.threadId, {
        interactionMode: event.payload.interactionMode,
        updatedAt: event.payload.updatedAt,
      })
    case 'thread.turn-start-requested':
      return applyThreadTurnStartRequestedEvent(state, event)
    case 'thread.turn-interrupt-requested':
      return applyThreadTurnInterruptRequestedEvent(state, event)
    case 'thread.session-stop-requested':
      return applyThreadSessionStopRequestedEvent(state, event)
    case 'thread.session-set':
      return applyThreadSessionSetEvent(state, event)
    case 'thread.message-sent':
      return applyThreadMessageSentEvent(state, event)
    case 'thread.activity-appended':
      return applyThreadActivityAppendedEvent(state, event)
    case 'thread.proposed-plan-upserted':
      return applyThreadProposedPlanUpsertedEvent(state, event)
    case 'thread.turn-diff-completed':
      return applyThreadTurnDiffCompletedEvent(state, event)
    case 'thread.checkpoint-revert-requested':
      return state
    case 'thread.reverted':
      return applyThreadRevertedEvent(state, event)
    case 'thread.approval-response-requested':
    case 'thread.user-input-response-requested':
      return state
  }
}

function writeProject(
  state: ChatProjectionState,
  project: OrchestrationProjectShell,
): ChatProjectionState {
  return {
    ...state,
    projectById: {
      ...state.projectById,
      [project.id]: project,
    },
    projectIds: appendId(state.projectIds, project.id),
  }
}

function patchProject(
  state: ChatProjectionState,
  projectId: ProjectId,
  patch: Partial<OrchestrationProjectShell>,
): ChatProjectionState {
  const project = state.projectById[projectId]
  if (!project) return state

  return {
    ...state,
    projectById: {
      ...state.projectById,
      [projectId]: compactUpdate(project, patch),
    },
  }
}

function removeProject(state: ChatProjectionState, projectId: ProjectId): ChatProjectionState {
  if (!state.projectById[projectId]) return state

  return {
    ...state,
    projectById: removeRecordKey(state.projectById, projectId),
    projectIds: removeId(state.projectIds, projectId),
  }
}

function writeThreadShellState(
  state: ChatProjectionState,
  thread: OrchestrationThreadShell,
): ChatProjectionState {
  const previousShell = state.threadShellById[thread.id]
  const threadShell = shellFromThreadShell(thread)
  const turnState = turnStateFromLatestTurn(thread.latestTurn)
  let nextState = ensureThreadRegistered(
    state,
    thread.id,
    thread.projectId,
    previousShell?.projectId,
  )

  nextState = {
    ...nextState,
    sidebarThreadSummaryById: {
      ...nextState.sidebarThreadSummaryById,
      [thread.id]: sidebarSummaryFromThreadShell(thread),
    },
    threadSessionById: {
      ...nextState.threadSessionById,
      [thread.id]: thread.session,
    },
    threadShellById: {
      ...nextState.threadShellById,
      [thread.id]: threadShell,
    },
    threadTurnStateById: {
      ...nextState.threadTurnStateById,
      [thread.id]: turnState,
    },
  }

  return nextState
}

function writeThreadDetailState(
  state: ChatProjectionState,
  thread: OrchestrationThread,
): ChatProjectionState {
  const previousShell = state.threadShellById[thread.id]
  const nextState = ensureThreadRegistered(
    state,
    thread.id,
    thread.projectId,
    previousShell?.projectId,
  )
  const activitySlice = buildActivitySlice(thread.activities)
  const messageSlice = buildMessageSlice(thread.messages)

  return {
    ...nextState,
    activityByThreadId: {
      ...nextState.activityByThreadId,
      [thread.id]: activitySlice.byId,
    },
    activityIdsByThreadId: {
      ...nextState.activityIdsByThreadId,
      [thread.id]: activitySlice.ids,
    },
    messageByThreadId: {
      ...nextState.messageByThreadId,
      [thread.id]: messageSlice.byId,
    },
    messageIdsByThreadId: {
      ...nextState.messageIdsByThreadId,
      [thread.id]: messageSlice.ids,
    },
    threadSessionById: {
      ...nextState.threadSessionById,
      [thread.id]: thread.session,
    },
    threadShellById: {
      ...nextState.threadShellById,
      [thread.id]: shellFromThreadDetail(thread),
    },
    threadTurnStateById: {
      ...nextState.threadTurnStateById,
      [thread.id]: turnStateFromLatestTurn(thread.latestTurn),
    },
  }
}

function writeCreatedThread(
  state: ChatProjectionState,
  event: Extract<OrchestrationEvent, { type: 'thread.created' }>,
): ChatProjectionState {
  const thread: OrchestrationThread = {
    activities: [],
    archivedAt: null,
    branch: event.payload.branch,
    createdAt: event.payload.createdAt,
    deletedAt: null,
    id: event.payload.threadId,
    interactionMode: event.payload.interactionMode ?? DEFAULT_INTERACTION_MODE,
    latestTurn: null,
    messages: [],
    modelSelection: event.payload.modelSelection,
    projectId: event.payload.projectId,
    runtimeMode: event.payload.runtimeMode ?? DEFAULT_RUNTIME_MODE,
    session: null,
    title: event.payload.title,
    updatedAt: event.payload.updatedAt,
    worktreePath: event.payload.worktreePath,
  }

  return writeThreadDetailState(state, thread)
}

function applyThreadMetaUpdatedEvent(
  state: ChatProjectionState,
  event: Extract<OrchestrationEvent, { type: 'thread.meta-updated' }>,
): ChatProjectionState {
  return patchThreadShellAndSummary(state, event.payload.threadId, {
    branch: event.payload.branch,
    modelSelection: event.payload.modelSelection,
    title: event.payload.title,
    updatedAt: event.payload.updatedAt,
    worktreePath: event.payload.worktreePath,
  })
}

function applyThreadTurnStartRequestedEvent(
  state: ChatProjectionState,
  event: Extract<OrchestrationEvent, { type: 'thread.turn-start-requested' }>,
): ChatProjectionState {
  const latestTurn: OrchestrationLatestTurn = {
    assistantMessageId: null,
    completedAt: null,
    requestedAt: event.payload.createdAt,
    sourceProposedPlan: event.payload.sourceProposedPlan,
    startedAt: null,
    state: 'running',
    turnId: event.payload.turnId,
  }

  const nextState = patchThreadShellAndSummary(state, event.payload.threadId, {
    interactionMode: event.payload.interactionMode,
    modelSelection: event.payload.modelSelection,
    runtimeMode: event.payload.runtimeMode,
    updatedAt: event.payload.createdAt,
  })

  return writeThreadTurnState(nextState, event.payload.threadId, {
    latestTurn,
    pendingSourceProposedPlan: event.payload.sourceProposedPlan,
  })
}

function applyThreadTurnInterruptRequestedEvent(
  state: ChatProjectionState,
  event: Extract<OrchestrationEvent, { type: 'thread.turn-interrupt-requested' }>,
): ChatProjectionState {
  const turnState = state.threadTurnStateById[event.payload.threadId]
  if (!event.payload.turnId || !turnState?.latestTurn) return state
  if (turnState.latestTurn.turnId !== event.payload.turnId) return state

  return writeThreadTurnState(state, event.payload.threadId, {
    ...turnState,
    latestTurn: {
      ...turnState.latestTurn,
      completedAt: turnState.latestTurn.completedAt ?? event.payload.createdAt,
      startedAt: turnState.latestTurn.startedAt ?? event.payload.createdAt,
      state: 'interrupted',
    },
  })
}

function applyThreadSessionStopRequestedEvent(
  state: ChatProjectionState,
  event: Extract<OrchestrationEvent, { type: 'thread.session-stop-requested' }>,
): ChatProjectionState {
  return writeThreadSession(state, event.payload.threadId, null)
}

function applyThreadSessionSetEvent(
  state: ChatProjectionState,
  event: Extract<OrchestrationEvent, { type: 'thread.session-set' }>,
): ChatProjectionState {
  const nextState = writeThreadSession(state, event.payload.threadId, event.payload.session)

  if (event.payload.session.status !== 'running') return nextState
  if (event.payload.session.activeTurnId === null) return nextState

  const currentTurn = nextState.threadTurnStateById[event.payload.threadId]?.latestTurn
  const activeTurnId = event.payload.session.activeTurnId

  return writeThreadTurnState(nextState, event.payload.threadId, {
    latestTurn: {
      assistantMessageId:
        currentTurn?.turnId === activeTurnId ? currentTurn.assistantMessageId : null,
      completedAt: null,
      requestedAt:
        currentTurn?.turnId === activeTurnId
          ? currentTurn.requestedAt
          : event.payload.session.updatedAt,
      sourceProposedPlan:
        currentTurn?.turnId === activeTurnId ? currentTurn.sourceProposedPlan : undefined,
      startedAt:
        currentTurn?.turnId === activeTurnId
          ? (currentTurn.startedAt ?? event.payload.session.updatedAt)
          : event.payload.session.updatedAt,
      state: 'running',
      turnId: activeTurnId,
    },
  })
}

function applyThreadMessageSentEvent(
  state: ChatProjectionState,
  event: Extract<OrchestrationEvent, { type: 'thread.message-sent' }>,
): ChatProjectionState {
  const threadId = event.payload.threadId
  const message = messageFromEvent(event)
  const currentIds = state.messageIdsByThreadId[threadId] ?? []
  const currentById = state.messageByThreadId[threadId] ?? {}
  const nextMessage = mergeMessage(currentById[message.id], message)
  const nextIds = appendId(currentIds, message.id).slice(-CHAT_MESSAGE_CACHE_LIMIT)
  const nextById = retainRecordKeys(
    {
      ...currentById,
      [message.id]: nextMessage,
    },
    new Set(nextIds),
  )

  const nextState = patchThreadShell(
    {
      ...state,
      messageByThreadId: {
        ...state.messageByThreadId,
        [threadId]: nextById,
      },
      messageIdsByThreadId: {
        ...state.messageIdsByThreadId,
        [threadId]: nextIds,
      },
    },
    threadId,
    {
      updatedAt: event.payload.updatedAt,
    },
  )

  return writeAssistantMessageTurnState(nextState, event)
}

function applyThreadActivityAppendedEvent(
  state: ChatProjectionState,
  event: Extract<OrchestrationEvent, { type: 'thread.activity-appended' }>,
): ChatProjectionState {
  const activity = {
    ...event.payload.activity,
    sequence: event.payload.activity.sequence ?? event.sequence,
  }
  const threadId = event.payload.threadId
  const currentById = state.activityByThreadId[threadId] ?? {}
  const activities = recordValues<OrchestrationThreadActivity>({
    ...currentById,
    [activity.id]: activity,
  }).sort(compareActivities)
  const cappedActivities = activities.slice(-CHAT_ACTIVITY_CACHE_LIMIT)
  const nextIds = cappedActivities.map((entry) => entry.id)

  return writeTurnFailureState(
    {
      ...patchThreadShell(state, threadId, { updatedAt: activity.createdAt }),
      activityByThreadId: {
        ...state.activityByThreadId,
        [threadId]: recordById(cappedActivities, (entry) => entry.id),
      },
      activityIdsByThreadId: {
        ...state.activityIdsByThreadId,
        [threadId]: nextIds,
      },
    },
    activity,
  )
}

function applyThreadProposedPlanUpsertedEvent(
  state: ChatProjectionState,
  event: Extract<OrchestrationEvent, { type: 'thread.proposed-plan-upserted' }>,
): ChatProjectionState {
  const threadId = event.payload.threadId
  const currentById = state.proposedPlanByThreadId[threadId] ?? {}
  const plans = recordValues<OrchestrationProposedPlan>({
    ...currentById,
    [event.payload.proposedPlan.id]: event.payload.proposedPlan,
  })
    .toSorted(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
    )
    .slice(-CHAT_PROPOSED_PLAN_CACHE_LIMIT)

  return {
    ...patchThreadShell(state, threadId, {
      updatedAt: event.payload.proposedPlan.updatedAt,
    }),
    proposedPlanByThreadId: {
      ...state.proposedPlanByThreadId,
      [threadId]: recordById(plans, (entry) => entry.id),
    },
    proposedPlanIdsByThreadId: {
      ...state.proposedPlanIdsByThreadId,
      [threadId]: plans.map((entry) => entry.id),
    },
  }
}

function applyThreadTurnDiffCompletedEvent(
  state: ChatProjectionState,
  event: Extract<OrchestrationEvent, { type: 'thread.turn-diff-completed' }>,
): ChatProjectionState {
  const summary: ChatTurnDiffSummary = {
    assistantMessageId: event.payload.assistantMessageId,
    checkpointRef: event.payload.checkpointRef,
    checkpointTurnCount: event.payload.checkpointTurnCount,
    completedAt: event.payload.completedAt,
    files: event.payload.files,
    status: event.payload.status,
    threadId: event.payload.threadId,
    turnId: event.payload.turnId,
  }
  const threadId = event.payload.threadId
  const currentById = state.turnDiffSummaryByThreadId[threadId] ?? {}
  const summaries = recordValues<ChatTurnDiffSummary>({
    ...currentById,
    [summary.turnId]: summary,
  })
    .toSorted((left, right) => left.checkpointTurnCount - right.checkpointTurnCount)
    .slice(-CHAT_CHECKPOINT_CACHE_LIMIT)
  const nextState = {
    ...patchThreadShell(state, threadId, { updatedAt: event.payload.completedAt }),
    turnDiffIdsByThreadId: {
      ...state.turnDiffIdsByThreadId,
      [threadId]: summaries.map((entry) => entry.turnId),
    },
    turnDiffSummaryByThreadId: {
      ...state.turnDiffSummaryByThreadId,
      [threadId]: recordById(summaries, (entry) => entry.turnId),
    },
  }

  return writeThreadTurnState(nextState, threadId, {
    latestTurn: {
      assistantMessageId: event.payload.assistantMessageId,
      completedAt: event.payload.completedAt,
      requestedAt:
        state.threadTurnStateById[threadId]?.latestTurn?.requestedAt ?? event.payload.completedAt,
      startedAt:
        state.threadTurnStateById[threadId]?.latestTurn?.startedAt ?? event.payload.completedAt,
      state: checkpointStatusToLatestTurnState(event.payload.status),
      turnId: event.payload.turnId,
    },
  })
}

function applyThreadRevertedEvent(
  state: ChatProjectionState,
  event: Extract<OrchestrationEvent, { type: 'thread.reverted' }>,
): ChatProjectionState {
  const threadId = event.payload.threadId
  const summaries = selectTurnDiffSummaries(state, threadId)
    .filter((summary) => summary.checkpointTurnCount <= event.payload.turnCount)
    .slice(-CHAT_CHECKPOINT_CACHE_LIMIT)
  const retainedTurnIds = new Set(summaries.map((summary) => summary.turnId))
  const messages = selectMessages(state, threadId).filter((message) =>
    shouldRetainAfterRevert(message.turnId, retainedTurnIds),
  )
  const activities = selectActivities(state, threadId).filter((activity) =>
    shouldRetainAfterRevert(activity.turnId, retainedTurnIds),
  )
  const plans = selectProposedPlans(state, threadId).filter((plan) =>
    shouldRetainAfterRevert(plan.turnId, retainedTurnIds),
  )

  return {
    ...patchThreadShell(state, threadId, { updatedAt: event.payload.revertedAt }),
    activityByThreadId: {
      ...state.activityByThreadId,
      [threadId]: recordById(activities, (entry) => entry.id),
    },
    activityIdsByThreadId: {
      ...state.activityIdsByThreadId,
      [threadId]: activities.map((activity) => activity.id),
    },
    messageByThreadId: {
      ...state.messageByThreadId,
      [threadId]: recordById(messages, (entry) => entry.id),
    },
    messageIdsByThreadId: {
      ...state.messageIdsByThreadId,
      [threadId]: messages.map((message) => message.id),
    },
    proposedPlanByThreadId: {
      ...state.proposedPlanByThreadId,
      [threadId]: recordById(plans, (entry) => entry.id),
    },
    proposedPlanIdsByThreadId: {
      ...state.proposedPlanIdsByThreadId,
      [threadId]: plans.map((plan) => plan.id),
    },
    turnDiffIdsByThreadId: {
      ...state.turnDiffIdsByThreadId,
      [threadId]: summaries.map((summary) => summary.turnId),
    },
    turnDiffSummaryByThreadId: {
      ...state.turnDiffSummaryByThreadId,
      [threadId]: recordById(summaries, (summary) => summary.turnId),
    },
  }
}

function writeThreadSession(
  state: ChatProjectionState,
  threadId: ThreadId,
  session: OrchestrationSession | null,
): ChatProjectionState {
  return {
    ...state,
    threadSessionById: {
      ...state.threadSessionById,
      [threadId]: session,
    },
  }
}

function writeThreadTurnState(
  state: ChatProjectionState,
  threadId: ThreadId,
  turnState: ChatProjectionThreadTurnState,
): ChatProjectionState {
  return {
    ...state,
    threadTurnStateById: {
      ...state.threadTurnStateById,
      [threadId]: turnState,
    },
  }
}

function writeTurnFailureState(
  state: ChatProjectionState,
  activity: OrchestrationThreadActivity,
): ChatProjectionState {
  if (!isProviderTurnFailureActivity(activity.kind)) return state
  if (!activity.turnId) return state

  const turnState = state.threadTurnStateById[activity.threadId]
  const latestTurn = turnState?.latestTurn
  if (!latestTurn) return state
  if (latestTurn.turnId !== activity.turnId) return state

  return writeThreadTurnState(state, activity.threadId, {
    ...turnState,
    latestTurn: {
      ...latestTurn,
      completedAt: latestTurn.completedAt ?? activity.createdAt,
      startedAt: latestTurn.startedAt ?? activity.createdAt,
      state: 'error',
    },
  })
}

function isProviderTurnFailureActivity(kind: string) {
  return kind === 'provider.turn.start.failed' || kind === 'provider.turn.failed'
}

function writeAssistantMessageTurnState(
  state: ChatProjectionState,
  event: Extract<OrchestrationEvent, { type: 'thread.message-sent' }>,
): ChatProjectionState {
  if (event.payload.role !== 'assistant') return state
  if (!event.payload.turnId) return state

  const threadId = event.payload.threadId
  const current = state.threadTurnStateById[threadId]
  const latestTurn = current?.latestTurn
  if (latestTurn?.turnId && latestTurn.turnId !== event.payload.turnId) return state

  return writeThreadTurnState(state, threadId, {
    latestTurn: {
      assistantMessageId: event.payload.messageId,
      completedAt: event.payload.streaming
        ? (latestTurn?.completedAt ?? null)
        : (latestTurn?.completedAt ?? event.payload.updatedAt),
      requestedAt: latestTurn?.requestedAt ?? event.payload.createdAt,
      sourceProposedPlan: latestTurn?.sourceProposedPlan,
      startedAt: latestTurn?.startedAt ?? event.payload.createdAt,
      state: assistantMessageLatestTurnState(latestTurn?.state, event.payload.streaming),
      turnId: event.payload.turnId,
    },
    pendingSourceProposedPlan: current?.pendingSourceProposedPlan,
  })
}

function patchThreadShellAndSummary(
  state: ChatProjectionState,
  threadId: ThreadId,
  patch: Partial<ChatProjectionThreadShell>,
): ChatProjectionState {
  const nextState = patchThreadShell(state, threadId, patch)
  const summary = state.sidebarThreadSummaryById[threadId]
  const nextSummaryById = summary
    ? {
        ...state.sidebarThreadSummaryById,
        [threadId]: compactUpdate(summary, pickSummaryPatch(patch)),
      }
    : state.sidebarThreadSummaryById

  if (nextSummaryById === state.sidebarThreadSummaryById) return nextState

  return {
    ...nextState,
    sidebarThreadSummaryById: nextSummaryById,
  }
}

function patchThreadShell(
  state: ChatProjectionState,
  threadId: ThreadId,
  patch: Partial<ChatProjectionThreadShell>,
): ChatProjectionState {
  const shell = state.threadShellById[threadId]
  const nextShellById = shell
    ? {
        ...state.threadShellById,
        [threadId]: compactUpdate(shell, patch),
      }
    : state.threadShellById

  if (nextShellById === state.threadShellById) return state

  return {
    ...state,
    threadShellById: nextShellById,
  }
}

function ensureThreadRegistered(
  state: ChatProjectionState,
  threadId: ThreadId,
  nextProjectId: ProjectId,
  previousProjectId: ProjectId | undefined,
): ChatProjectionState {
  const nextState = state.threadIds.includes(threadId)
    ? state
    : {
        ...state,
        threadIds: [...state.threadIds, threadId],
      }

  return moveThreadProjectIndex(nextState, threadId, nextProjectId, previousProjectId)
}

function moveThreadProjectIndex(
  state: ChatProjectionState,
  threadId: ThreadId,
  nextProjectId: ProjectId,
  previousProjectId: ProjectId | undefined,
): ChatProjectionState {
  if (previousProjectId === nextProjectId)
    return ensureProjectThreadId(state, nextProjectId, threadId)

  const withoutPrevious = previousProjectId
    ? removeProjectThreadId(state.threadIdsByProjectId, previousProjectId, threadId)
    : state.threadIdsByProjectId
  const nextThreadIdsByProjectId = appendProjectThreadId(withoutPrevious, nextProjectId, threadId)

  if (nextThreadIdsByProjectId === state.threadIdsByProjectId) return state

  return {
    ...state,
    threadIdsByProjectId: nextThreadIdsByProjectId,
  }
}

function ensureProjectThreadId(
  state: ChatProjectionState,
  projectId: ProjectId,
  threadId: ThreadId,
): ChatProjectionState {
  const nextThreadIdsByProjectId = appendProjectThreadId(
    state.threadIdsByProjectId,
    projectId,
    threadId,
  )
  if (nextThreadIdsByProjectId === state.threadIdsByProjectId) return state

  return {
    ...state,
    threadIdsByProjectId: nextThreadIdsByProjectId,
  }
}

function removeThreadState(state: ChatProjectionState, threadId: ThreadId): ChatProjectionState {
  return {
    ...state,
    activityByThreadId: removeRecordKey(state.activityByThreadId, threadId),
    activityIdsByThreadId: removeRecordKey(state.activityIdsByThreadId, threadId),
    messageByThreadId: removeRecordKey(state.messageByThreadId, threadId),
    messageIdsByThreadId: removeRecordKey(state.messageIdsByThreadId, threadId),
    proposedPlanByThreadId: removeRecordKey(state.proposedPlanByThreadId, threadId),
    proposedPlanIdsByThreadId: removeRecordKey(state.proposedPlanIdsByThreadId, threadId),
    sidebarThreadSummaryById: removeRecordKey(state.sidebarThreadSummaryById, threadId),
    threadDetailSequenceById: removeRecordKey(state.threadDetailSequenceById, threadId),
    threadIds: removeId(state.threadIds, threadId),
    threadIdsByProjectId: removeThreadFromAllProjectIndexes(state.threadIdsByProjectId, threadId),
    threadSessionById: removeRecordKey(state.threadSessionById, threadId),
    threadShellById: removeRecordKey(state.threadShellById, threadId),
    threadTurnStateById: removeRecordKey(state.threadTurnStateById, threadId),
    turnDiffIdsByThreadId: removeRecordKey(state.turnDiffIdsByThreadId, threadId),
    turnDiffSummaryByThreadId: removeRecordKey(state.turnDiffSummaryByThreadId, threadId),
  }
}

function projectStateFromShell(projects: ReadonlyArray<OrchestrationProjectShell>) {
  return {
    projectById: recordById(projects, (project) => project.id),
    projectIds: projects.map((project) => project.id),
  }
}

function shellFromThreadShell(thread: OrchestrationThreadShell): ChatProjectionThreadShell {
  return {
    archivedAt: thread.archivedAt,
    branch: thread.branch,
    createdAt: thread.createdAt,
    id: thread.id,
    interactionMode: thread.interactionMode,
    modelSelection: thread.modelSelection,
    projectId: thread.projectId,
    runtimeMode: thread.runtimeMode,
    title: thread.title,
    updatedAt: thread.updatedAt,
    worktreePath: thread.worktreePath,
  }
}

function shellFromThreadDetail(thread: OrchestrationThread): ChatProjectionThreadShell {
  return {
    archivedAt: thread.archivedAt,
    branch: thread.branch,
    createdAt: thread.createdAt,
    id: thread.id,
    interactionMode: thread.interactionMode ?? DEFAULT_INTERACTION_MODE,
    modelSelection: thread.modelSelection,
    projectId: thread.projectId,
    runtimeMode: thread.runtimeMode ?? DEFAULT_RUNTIME_MODE,
    title: thread.title,
    updatedAt: thread.updatedAt,
    worktreePath: thread.worktreePath,
  }
}

function sidebarSummaryFromThreadShell(thread: OrchestrationThreadShell): ChatSidebarThreadSummary {
  return {
    archivedAt: thread.archivedAt,
    branch: thread.branch,
    createdAt: thread.createdAt,
    hasActionableProposedPlan: thread.hasActionableProposedPlan,
    id: thread.id,
    interactionMode: thread.interactionMode,
    latestTurn: thread.latestTurn,
    latestUserMessageAt: thread.latestUserMessageAt,
    pendingApprovalCount: thread.pendingApprovalCount,
    pendingUserInputCount: thread.pendingUserInputCount,
    projectId: thread.projectId,
    session: thread.session,
    title: thread.title,
    updatedAt: thread.updatedAt,
    worktreePath: thread.worktreePath,
  }
}

function turnStateFromLatestTurn(
  latestTurn: OrchestrationLatestTurn | null,
): ChatProjectionThreadTurnState {
  return {
    latestTurn,
    pendingSourceProposedPlan: latestTurn?.sourceProposedPlan,
  }
}

function buildMessageSlice(messages: OrchestrationMessage[]) {
  const cappedMessages = messages.slice(-CHAT_MESSAGE_CACHE_LIMIT)

  return {
    byId: recordById(cappedMessages, (message) => message.id),
    ids: cappedMessages.map((message) => message.id),
  }
}

function buildActivitySlice(activities: OrchestrationThreadActivity[]) {
  const cappedActivities = activities.slice(-CHAT_ACTIVITY_CACHE_LIMIT)

  return {
    byId: recordById(cappedActivities, (activity) => activity.id),
    ids: cappedActivities.map((activity) => activity.id),
  }
}

function messageFromEvent(
  event: Extract<OrchestrationEvent, { type: 'thread.message-sent' }>,
): OrchestrationMessage {
  return {
    attachments: event.payload.attachments,
    createdAt: event.payload.createdAt,
    id: event.payload.messageId,
    role: event.payload.role,
    streaming: event.payload.streaming,
    text: event.payload.text,
    threadId: event.payload.threadId,
    turnId: event.payload.turnId,
    updatedAt: event.payload.updatedAt,
  }
}

function mergeMessage(
  previous: OrchestrationMessage | undefined,
  next: OrchestrationMessage,
): OrchestrationMessage {
  if (!previous) return next

  return {
    ...previous,
    attachments: next.attachments.length > 0 ? next.attachments : previous.attachments,
    streaming: next.streaming,
    text: next.text ? `${previous.text}${next.text}` : previous.text,
    turnId: next.turnId,
    updatedAt: next.updatedAt,
  }
}

function selectMessages(state: ChatProjectionState, threadId: ThreadId) {
  return collectByIds(state.messageIdsByThreadId[threadId], state.messageByThreadId[threadId])
}

function selectActivities(state: ChatProjectionState, threadId: ThreadId) {
  return collectByIds(state.activityIdsByThreadId[threadId], state.activityByThreadId[threadId])
}

function selectProposedPlans(state: ChatProjectionState, threadId: ThreadId) {
  return collectByIds(
    state.proposedPlanIdsByThreadId[threadId],
    state.proposedPlanByThreadId[threadId],
  )
}

function selectTurnDiffSummaries(state: ChatProjectionState, threadId: ThreadId) {
  return collectByIds(
    state.turnDiffIdsByThreadId[threadId],
    state.turnDiffSummaryByThreadId[threadId],
  )
}

function collectByIds<TKey extends string, TValue>(
  ids: readonly TKey[] | undefined,
  byId: Record<TKey, TValue> | undefined,
): TValue[] {
  if (!ids || !byId) return []

  return ids.flatMap((id) => {
    const value = byId[id]
    return value ? [value] : []
  })
}

function appendProjectThreadId(
  record: Record<ProjectId, ThreadId[]>,
  projectId: ProjectId,
  threadId: ThreadId,
) {
  const ids = record[projectId] ?? EMPTY_THREAD_IDS
  const nextIds = appendId(ids, threadId)
  if (nextIds === ids) return record

  return {
    ...record,
    [projectId]: nextIds,
  }
}

function removeProjectThreadId(
  record: Record<ProjectId, ThreadId[]>,
  projectId: ProjectId,
  threadId: ThreadId,
) {
  const ids = record[projectId]
  if (!ids) return record

  const nextIds = removeId(ids, threadId)
  if (nextIds.length === ids.length) return record
  if (nextIds.length > 0) {
    return {
      ...record,
      [projectId]: nextIds,
    }
  }

  return removeRecordKey(record, projectId)
}

function removeThreadFromAllProjectIndexes(
  record: Record<ProjectId, ThreadId[]>,
  threadId: ThreadId,
) {
  let nextRecord = record

  for (const projectId of Object.keys(record) as ProjectId[]) {
    nextRecord = removeProjectThreadId(nextRecord, projectId, threadId)
  }

  return nextRecord
}

function appendId<T extends string>(ids: readonly T[], id: T): T[] {
  if (ids.includes(id)) return ids as T[]

  return [...ids, id]
}

function removeId<T extends string>(ids: readonly T[], id: T): T[] {
  return ids.filter((value) => value !== id)
}

function retainThreadScopedRecord<T>(
  record: Record<ThreadId, T>,
  threadIds: ReadonlySet<ThreadId>,
): Record<ThreadId, T> {
  return Object.fromEntries(
    Object.entries(record).flatMap(([threadId, value]) =>
      threadIds.has(threadId as ThreadId) ? [[threadId, value] as const] : [],
    ),
  ) as Record<ThreadId, T>
}

function retainRecordKeys<TKey extends string, TValue>(
  record: Record<TKey, TValue>,
  keys: ReadonlySet<TKey>,
): Record<TKey, TValue> {
  return Object.fromEntries(
    Object.entries(record).flatMap(([key, value]) =>
      keys.has(key as TKey) ? [[key, value] as const] : [],
    ),
  ) as Record<TKey, TValue>
}

function recordValues<TValue>(record: object): TValue[] {
  return Object.values(record) as TValue[]
}

function removeRecordKey<TKey extends string, TValue>(
  record: Record<TKey, TValue>,
  key: TKey,
): Record<TKey, TValue> {
  if (!(key in record)) return record

  const nextRecord = { ...record }
  delete nextRecord[key]

  return nextRecord
}

function recordById<TValue, TKey extends string>(
  values: readonly TValue[],
  getKey: (value: TValue) => TKey,
): Record<TKey, TValue> {
  return Object.fromEntries(values.map((value) => [getKey(value), value] as const)) as Record<
    TKey,
    TValue
  >
}

function compactUpdate<T extends object>(value: T, patch: Partial<T>): T {
  const entries = Object.entries(patch).filter(([, candidate]) => candidate !== undefined)
  if (entries.length === 0) return value

  return Object.assign({ ...value }, Object.fromEntries(entries)) as T
}

function pickSummaryPatch(
  patch: Partial<ChatProjectionThreadShell>,
): Partial<ChatSidebarThreadSummary> {
  return {
    archivedAt: patch.archivedAt,
    branch: patch.branch,
    createdAt: patch.createdAt,
    interactionMode: patch.interactionMode,
    projectId: patch.projectId,
    title: patch.title,
    updatedAt: patch.updatedAt,
    worktreePath: patch.worktreePath,
  }
}

function compareActivities(left: OrchestrationThreadActivity, right: OrchestrationThreadActivity) {
  const leftSequence = left.sequence ?? Number.MAX_SAFE_INTEGER
  const rightSequence = right.sequence ?? Number.MAX_SAFE_INTEGER

  return (
    leftSequence - rightSequence ||
    left.createdAt.localeCompare(right.createdAt) ||
    left.id.localeCompare(right.id)
  )
}

function checkpointStatusToLatestTurnState(status: ChatTurnDiffSummary['status']) {
  if (status === 'error') return 'error'
  if (status === 'missing') return 'interrupted'

  return 'completed'
}

function assistantMessageLatestTurnState(
  current: OrchestrationLatestTurn['state'] | undefined,
  streaming: boolean,
) {
  if (streaming) return current ?? 'running'
  if (current === 'interrupted' || current === 'error') return current

  return 'completed'
}

function shouldRetainAfterRevert<TTurnId extends string | null>(
  turnId: TTurnId,
  retainedTurnIds: ReadonlySet<TurnId>,
) {
  return turnId === null || retainedTurnIds.has(turnId as TurnId)
}
