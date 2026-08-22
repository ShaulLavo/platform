import type {
  OrchestrationLatestTurn,
  OrchestrationThreadActivity,
  OrchestrationThreadDetailAnchor,
  OrchestrationWsThreadDetailPageInput,
  OrchestrationProjectShell,
  OrchestrationSession,
  ProjectId,
  ThreadId,
} from '@workspace/contracts'

import type { ChatProjectionState, ChatThread, ProjectionThread } from './chat-projection-store'

const EMPTY_MESSAGES: ChatThread['messages'] = []
const EMPTY_ACTIVITIES: OrchestrationThreadActivity[] = []
const EMPTY_PROJECTS: OrchestrationProjectShell[] = []
const EMPTY_PROPOSED_PLANS: ChatThread['proposedPlans'] = []
const EMPTY_THREADS: ProjectionThread[] = []
const EMPTY_TURN_DIFF_SUMMARIES: ChatThread['turnDiffSummaries'] = []

const collectedByIdsCache = new WeakMap<readonly string[], WeakMap<object, readonly unknown[]>>()
const unarchivedThreadsCache = new WeakMap<object, ProjectionThread[]>()
const threadCache = new WeakMap<
  ProjectionThread,
  {
    activities: ChatThread['activities']
    messages: ChatThread['messages']
    proposedPlans: ChatThread['proposedPlans']
    thread: ChatThread
    turnDiffSummaries: ChatThread['turnDiffSummaries']
  }
>()

export function selectChatProjects(state: ChatProjectionState) {
  return collectByIds(state.projectIds, state.projectById, EMPTY_PROJECTS)
}

export function selectChatSidebarThreads(state: ChatProjectionState): ProjectionThread[] {
  return unarchivedThreads(collectByIds(state.threadIds, state.threadById, EMPTY_THREADS))
}

export function selectChatSidebarThreadsForProject(
  state: ChatProjectionState,
  projectId: ProjectId | null | undefined,
): ProjectionThread[] {
  if (!projectId) return EMPTY_THREADS

  const threadIds = state.threadIdsByProjectId[projectId]

  return unarchivedThreads(collectByIds(threadIds, state.threadById, EMPTY_THREADS))
}

/**
 * Archiving means "leave the list", so an archived thread is not a sidebar thread at
 * all: every surface that picks one — the rail, the side panel, chat mode's auto-pick —
 * reads it out of here, which is the only way they can agree by construction. Cached on
 * the collected array's identity because these feed zustand selectors, and a fresh array
 * per read is a re-render loop.
 */
function unarchivedThreads(threads: ProjectionThread[]): ProjectionThread[] {
  if (threads.length === 0) return EMPTY_THREADS

  const cached = unarchivedThreadsCache.get(threads)
  if (cached) return cached

  const visible = threads.filter((thread) => !thread.archivedAt)
  const result = visible.length === threads.length ? threads : visible
  unarchivedThreadsCache.set(threads, result)

  return result
}

/**
 * A thread with its timelines attached. The shell-versus-detail merge that used to
 * happen here now happens once, in `threadFromDetail` — this only has to attach the
 * list slices and correct the live turn for a session that ended without one.
 *
 * Cached on the record's identity: this feeds zustand selectors, and a fresh object
 * per read is a re-render loop.
 */
export function selectChatThreadById(
  state: ChatProjectionState,
  threadId: ThreadId | null | undefined,
): ChatThread | undefined {
  if (!threadId) return undefined

  const projected = state.threadById[threadId]
  if (!projected) return undefined

  const messages = selectChatMessagesForThread(state, threadId)
  const activities = selectChatActivitiesForThread(state, threadId)
  const proposedPlans = selectChatProposedPlansForThread(state, threadId)
  const turnDiffSummaries = selectChatTurnDiffSummariesForThread(state, threadId)
  const cached = threadCache.get(projected)

  if (
    cached &&
    cached.activities === activities &&
    cached.messages === messages &&
    cached.proposedPlans === proposedPlans &&
    cached.turnDiffSummaries === turnDiffSummaries
  ) {
    return cached.thread
  }

  const { liveTurn, ...rest } = projected
  const thread: ChatThread = {
    ...rest,
    activities,
    // Nothing authoritative has published the flag for a detail-only thread, so the
    // plans it holds are the best answer available.
    hasActionableProposedPlan:
      projected.metaSource === 'shell'
        ? projected.hasActionableProposedPlan
        : hasOpenPlan(proposedPlans),
    latestTurn: latestTurnForSession(liveTurn, projected.session),
    messages,
    proposedPlans,
    turnDiffSummaries,
  }

  threadCache.set(projected, {
    activities,
    messages,
    proposedPlans,
    thread,
    turnDiffSummaries,
  })

  return thread
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

/**
 * Whether a "load earlier" affordance is worth offering. An unknown thread reads
 * as `true` rather than `false`: nothing held is indistinguishable from a window
 * that has not arrived yet, and offering a page that turns out to be empty is
 * recoverable where hiding reachable history is not.
 */
export function selectChatThreadHasEarlier(
  state: ChatProjectionState,
  threadId: ThreadId | null | undefined,
): boolean {
  if (!threadId) return false

  return state.threadHasEarlierById[threadId] ?? true
}

/**
 * Builds the backwards page request from the oldest rows the store still holds,
 * so the boundary is always the caller's own edge of the timeline — a trimmed
 * cache or a replaced window re-derives it instead of stranding history behind a
 * stale server-minted cursor.
 *
 * Imperative on purpose: it mints a fresh object, so read it through
 * `getState()` when the request is made rather than subscribing to it.
 */
export function chatThreadEarlierPageInput(
  state: ChatProjectionState,
  threadId: ThreadId,
  // The wire type, not the schema's `InferInput`: the latter widens `threadId`
  // back to a plain string and the transport would reject the branded id.
): OrchestrationWsThreadDetailPageInput {
  return {
    beforeActivity: anchorFrom(selectChatActivitiesForThread(state, threadId)[0]),
    beforeMessage: anchorFrom(selectChatMessagesForThread(state, threadId)[0]),
    threadId,
  }
}

function anchorFrom(
  row: { createdAt: string; id: string } | undefined,
): OrchestrationThreadDetailAnchor | null {
  if (!row) return null

  return { createdAt: row.createdAt, id: row.id }
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
