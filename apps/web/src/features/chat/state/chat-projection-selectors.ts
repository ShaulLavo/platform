import type {
  EventId,
  MessageId,
  OrchestrationThreadActivity,
  OrchestrationProjectShell,
  ProjectId,
  ProposedPlanId,
  ThreadId,
  TurnId,
} from '@workspace/contracts'

import type {
  ChatProjectionState,
  ChatProjectionThreadShell,
  ChatProjectionThreadTurnState,
  ChatSidebarThreadSummary,
  ChatThread,
  ChatTurnDiffSummary,
} from './chat-projection-store'

const EMPTY_MESSAGES: ChatThread['messages'] = []
const EMPTY_ACTIVITIES: OrchestrationThreadActivity[] = []
const EMPTY_PROJECTS: OrchestrationProjectShell[] = []
const EMPTY_PROPOSED_PLANS: ChatThread['proposedPlans'] = []
const EMPTY_SIDEBAR_THREADS: ChatSidebarThreadSummary[] = []
const EMPTY_THREAD_SHELLS: ChatProjectionThreadShell[] = []
const EMPTY_TURN_DIFF_SUMMARIES: ChatTurnDiffSummary[] = []

const collectedByIdsCache = new WeakMap<readonly string[], WeakMap<object, readonly unknown[]>>()
const threadCache = new WeakMap<
  ChatProjectionThreadShell,
  {
    activities: ChatThread['activities']
    messages: ChatThread['messages']
    proposedPlans: ChatThread['proposedPlans']
    session: ChatThread['session']
    thread: ChatThread
    turnDiffSummaries: ChatThread['turnDiffSummaries']
    turnState: ChatProjectionThreadTurnState | undefined
  }
>()

export function selectChatProjects(state: ChatProjectionState) {
  return collectByIds(state.projectIds, state.projectById, EMPTY_PROJECTS)
}

export function selectChatThreadShells(state: ChatProjectionState) {
  return collectByIds(state.threadIds, state.threadShellById, EMPTY_THREAD_SHELLS)
}

export function selectChatSidebarThreads(state: ChatProjectionState) {
  return collectByIds(state.threadIds, state.sidebarThreadSummaryById, EMPTY_SIDEBAR_THREADS)
}

export function selectChatSidebarThreadsForProject(
  state: ChatProjectionState,
  projectId: ProjectId | null | undefined,
): ChatSidebarThreadSummary[] {
  if (!projectId) return EMPTY_SIDEBAR_THREADS

  const threadIds = state.threadIdsByProjectId[projectId]

  return collectByIds(threadIds, state.sidebarThreadSummaryById, EMPTY_SIDEBAR_THREADS)
}

export function selectChatThreadById(
  state: ChatProjectionState,
  threadId: ThreadId | null | undefined,
): ChatThread | undefined {
  if (!threadId) return undefined

  const shell = state.threadShellById[threadId]
  if (!shell) return undefined

  const session = state.threadSessionById[threadId] ?? null
  const turnState = state.threadTurnStateById[threadId]
  const messages = selectChatMessagesForThread(state, threadId)
  const activities = selectChatActivitiesForThread(state, threadId)
  const proposedPlans = selectChatProposedPlansForThread(state, threadId)
  const turnDiffSummaries = selectChatTurnDiffSummariesForThread(state, threadId)
  const cached = threadCache.get(shell)

  if (
    cached &&
    cached.activities === activities &&
    cached.messages === messages &&
    cached.proposedPlans === proposedPlans &&
    cached.session === session &&
    cached.turnDiffSummaries === turnDiffSummaries &&
    cached.turnState === turnState
  ) {
    return cached.thread
  }

  const thread: ChatThread = {
    ...shell,
    activities,
    latestTurn: turnState?.latestTurn ?? null,
    messages,
    pendingSourceProposedPlan: turnState?.pendingSourceProposedPlan,
    proposedPlans,
    session,
    turnDiffSummaries,
  }

  threadCache.set(shell, {
    activities,
    messages,
    proposedPlans,
    session,
    thread,
    turnDiffSummaries,
    turnState,
  })

  return thread
}

export function selectChatMessagesForThread(state: ChatProjectionState, threadId: ThreadId) {
  return collectByIds(
    state.messageIdsByThreadId[threadId],
    state.messageByThreadId[threadId],
    EMPTY_MESSAGES,
  )
}

export function selectChatActivitiesForThread(state: ChatProjectionState, threadId: ThreadId) {
  return collectByIds(
    state.activityIdsByThreadId[threadId],
    state.activityByThreadId[threadId],
    EMPTY_ACTIVITIES,
  )
}

export function selectChatProposedPlansForThread(state: ChatProjectionState, threadId: ThreadId) {
  return collectByIds(
    state.proposedPlanIdsByThreadId[threadId],
    state.proposedPlanByThreadId[threadId],
    EMPTY_PROPOSED_PLANS,
  )
}

export function selectChatTurnDiffSummariesForThread(
  state: ChatProjectionState,
  threadId: ThreadId,
) {
  return collectByIds(
    state.turnDiffIdsByThreadId[threadId],
    state.turnDiffSummaryByThreadId[threadId],
    EMPTY_TURN_DIFF_SUMMARIES,
  )
}

export function createChatThreadSelector(threadId: ThreadId | null | undefined) {
  let previousState: ChatProjectionState | undefined
  let previousThread: ChatThread | undefined

  return (state: ChatProjectionState) => {
    if (previousState === state) return previousThread

    previousState = state
    previousThread = selectChatThreadById(state, threadId)

    return previousThread
  }
}

function collectByIds<TKey extends string, TValue>(
  ids: readonly TKey[] | undefined,
  byId: Record<TKey, TValue> | undefined,
  emptyValue: TValue[],
): TValue[] {
  if (!ids || ids.length === 0 || !byId) return emptyValue

  const cachedByRecord = collectedByIdsCache.get(ids)
  const cached = cachedByRecord?.get(byId)
  if (cached) return cached as TValue[]

  const values = ids.flatMap((id) => {
    const value = byId[id]
    return value ? [value] : []
  })
  const nextCachedByRecord = cachedByRecord ?? new WeakMap<object, readonly unknown[]>()
  nextCachedByRecord.set(byId, values)

  if (!cachedByRecord) {
    collectedByIdsCache.set(ids, nextCachedByRecord)
  }

  return values
}

export type ChatProjectionMessageIndex = Record<MessageId, ChatThread['messages'][number]>
export type ChatProjectionActivityIndex = Record<EventId, ChatThread['activities'][number]>
export type ChatProjectionProposedPlanIndex = Record<
  ProposedPlanId,
  ChatThread['proposedPlans'][number]
>
export type ChatProjectionTurnDiffIndex = Record<TurnId, ChatTurnDiffSummary>
