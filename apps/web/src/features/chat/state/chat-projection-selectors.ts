import type {
  OrchestrationLatestTurn,
  OrchestrationThreadActivity,
  OrchestrationProjectShell,
  OrchestrationSession,
  ProjectId,
  ThreadId,
} from '@workspace/contracts'

import type {
  ChatProjectionState,
  ChatProjectionThreadDetailMeta,
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
const EMPTY_TURN_DIFF_SUMMARIES: ChatTurnDiffSummary[] = []

const collectedByIdsCache = new WeakMap<readonly string[], WeakMap<object, readonly unknown[]>>()
const unarchivedThreadsCache = new WeakMap<object, ChatSidebarThreadSummary[]>()
const threadCache = new WeakMap<
  ChatProjectionThreadShell | ChatProjectionThreadDetailMeta,
  {
    activities: ChatThread['activities']
    detailMeta: ChatProjectionThreadDetailMeta | undefined
    messages: ChatThread['messages']
    proposedPlans: ChatThread['proposedPlans']
    session: ChatThread['session']
    summary: ChatSidebarThreadSummary | undefined
    thread: ChatThread
    turnDiffSummaries: ChatThread['turnDiffSummaries']
    turnState: ChatProjectionThreadTurnState | undefined
  }
>()

export function selectChatProjects(state: ChatProjectionState) {
  return collectByIds(state.projectIds, state.projectById, EMPTY_PROJECTS)
}

export function selectChatSidebarThreads(state: ChatProjectionState): ChatSidebarThreadSummary[] {
  return unarchivedThreads(
    collectByIds(state.threadIds, state.sidebarThreadSummaryById, EMPTY_SIDEBAR_THREADS),
  )
}

export function selectChatSidebarThreadsForProject(
  state: ChatProjectionState,
  projectId: ProjectId | null | undefined,
): ChatSidebarThreadSummary[] {
  if (!projectId) return EMPTY_SIDEBAR_THREADS

  const threadIds = state.threadIdsByProjectId[projectId]

  return unarchivedThreads(
    collectByIds(threadIds, state.sidebarThreadSummaryById, EMPTY_SIDEBAR_THREADS),
  )
}

/**
 * Archiving means "leave the list", so an archived thread is not a sidebar thread at
 * all: every surface that picks one — the rail, the side panel, chat mode's auto-pick —
 * reads it out of here, which is the only way they can agree by construction. Cached on
 * the collected array's identity because these feed zustand selectors, and a fresh array
 * per read is a re-render loop.
 */
function unarchivedThreads(threads: ChatSidebarThreadSummary[]): ChatSidebarThreadSummary[] {
  if (threads.length === 0) return EMPTY_SIDEBAR_THREADS

  const cached = unarchivedThreadsCache.get(threads)
  if (cached) return cached

  const visible = threads.filter((thread) => !thread.archivedAt)
  const result = visible.length === threads.length ? threads : visible
  unarchivedThreadsCache.set(threads, result)

  return result
}

/**
 * The one place shell and detail meet. Both subscriptions run independently, so a
 * detail cached before a reconnect can be older than the rail's copy of the thread —
 * the shell record therefore wins on branch, worktree, title and session, and the
 * detail record only fills in for a thread the shell has not delivered yet. Writers
 * stay slice-scoped so neither can quietly revert the other.
 */
export function selectChatThreadById(
  state: ChatProjectionState,
  threadId: ThreadId | null | undefined,
): ChatThread | undefined {
  if (!threadId) return undefined

  const detailMeta = state.threadDetailMetaById[threadId]
  const meta = state.threadShellById[threadId] ?? detailMeta
  if (!meta) return undefined

  const session = selectSessionForThread(state, threadId, detailMeta)
  const turnState = state.threadTurnStateById[threadId]
  const messages = selectChatMessagesForThread(state, threadId)
  const activities = selectChatActivitiesForThread(state, threadId)
  const proposedPlans = selectChatProposedPlansForThread(state, threadId)
  const turnDiffSummaries = selectChatTurnDiffSummariesForThread(state, threadId)
  const latestTurn = latestTurnForSession(
    turnState?.latestTurn ?? detailMeta?.latestTurn ?? null,
    session,
  )
  const summary = state.sidebarThreadSummaryById[threadId]
  const cached = threadCache.get(meta)

  if (
    cached &&
    cached.activities === activities &&
    cached.detailMeta === detailMeta &&
    cached.messages === messages &&
    cached.proposedPlans === proposedPlans &&
    cached.session === session &&
    cached.summary === summary &&
    cached.turnDiffSummaries === turnDiffSummaries &&
    cached.turnState === turnState
  ) {
    return cached.thread
  }

  const thread: ChatThread = {
    ...meta,
    activities,
    hasActionableProposedPlan: summary?.hasActionableProposedPlan ?? hasOpenPlan(proposedPlans),
    latestTurn,
    latestUserMessageAt: summary?.latestUserMessageAt ?? null,
    messages,
    pendingApprovalCount: summary?.pendingApprovalCount ?? 0,
    pendingSourceProposedPlan: turnState?.pendingSourceProposedPlan,
    pendingUserInputCount: summary?.pendingUserInputCount ?? 0,
    proposedPlans,
    session,
    turnDiffSummaries,
  }

  threadCache.set(meta, {
    activities,
    detailMeta,
    messages,
    proposedPlans,
    session,
    summary,
    thread,
    turnDiffSummaries,
    turnState,
  })

  return thread
}

/**
 * `null` is a real session value (stopped), so presence decides: only a thread the
 * shell has never delivered falls back to whatever its detail snapshot carried.
 */
function selectSessionForThread(
  state: ChatProjectionState,
  threadId: ThreadId,
  detailMeta: ChatProjectionThreadDetailMeta | undefined,
) {
  if (Object.hasOwn(state.threadSessionById, threadId)) {
    return state.threadSessionById[threadId] ?? null
  }

  return detailMeta?.session ?? null
}

function hasOpenPlan(proposedPlans: ChatThread['proposedPlans']) {
  return proposedPlans.some((plan) => !plan.implementedAt)
}

function latestTurnForSession(
  latestTurn: OrchestrationLatestTurn | null,
  session: OrchestrationSession | null,
) {
  if (!latestTurn) return null
  if (latestTurn.state !== 'running') return latestTurn
  if (!session) return latestTurn
  if (session.activeTurnId && session.activeTurnId !== latestTurn.turnId) return latestTurn
  if (session.status === 'error') return terminalLatestTurn(latestTurn, session.updatedAt, 'error')
  if (session.status === 'interrupted' || session.status === 'stopped') {
    return terminalLatestTurn(latestTurn, session.updatedAt, 'interrupted')
  }

  return latestTurn
}

function terminalLatestTurn(
  latestTurn: OrchestrationLatestTurn,
  completedAt: string,
  state: 'error' | 'interrupted',
): OrchestrationLatestTurn {
  return {
    ...latestTurn,
    completedAt: latestTurn.completedAt ?? completedAt,
    startedAt: latestTurn.startedAt ?? completedAt,
    state,
  }
}

function selectChatMessagesForThread(state: ChatProjectionState, threadId: ThreadId) {
  return collectByIds(
    state.messageIdsByThreadId[threadId],
    state.messageByThreadId[threadId],
    EMPTY_MESSAGES,
  )
}

function selectChatActivitiesForThread(state: ChatProjectionState, threadId: ThreadId) {
  return collectByIds(
    state.activityIdsByThreadId[threadId],
    state.activityByThreadId[threadId],
    EMPTY_ACTIVITIES,
  )
}

function selectChatProposedPlansForThread(state: ChatProjectionState, threadId: ThreadId) {
  return collectByIds(
    state.proposedPlanIdsByThreadId[threadId],
    state.proposedPlanByThreadId[threadId],
    EMPTY_PROPOSED_PLANS,
  )
}

function selectChatTurnDiffSummariesForThread(state: ChatProjectionState, threadId: ThreadId) {
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
