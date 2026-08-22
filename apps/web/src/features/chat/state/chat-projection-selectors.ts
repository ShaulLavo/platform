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
const EMPTY_THREAD_LIST: ChatThreadListProjection[] = []
const EMPTY_TURN_DIFF_SUMMARIES: ChatThread['turnDiffSummaries'] = []

const collectedByIdsCache = new WeakMap<readonly string[], WeakMap<object, readonly unknown[]>>()
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

/**
 * The fields a list surface can observe from a canonical thread. `liveTurn` and raw
 * `updatedAt` deliberately stay out: message deltas update both for every streamed
 * token, while the rail reads the shell-published turn and a stable activity stamp.
 */
export type ChatThreadListProjection = Pick<
  ProjectionThread,
  | 'archivedAt'
  | 'branch'
  | 'createdAt'
  | 'hasActionableProposedPlan'
  | 'id'
  | 'latestTurn'
  | 'latestUserMessageAt'
  | 'pendingApprovalCount'
  | 'pendingUserInputCount'
  | 'pinOrderKey'
  | 'planProgress'
  | 'projectId'
  | 'session'
  | 'title'
  | 'worktreePath'
> & {
  readonly activityAt: string
}

type ChatThreadListSelector = (state: ChatProjectionState) => ChatThreadListProjection[]

const selectAllSidebarThreads = createChatThreadListSelector({ includeArchived: false })
const selectAllSessionThreads = createChatThreadListSelector({ includeArchived: true })
const projectSidebarSelectors = new Map<ProjectId, ChatThreadListSelector>()
const projectSessionSelectors = new Map<ProjectId, ChatThreadListSelector>()

export function selectChatProjects(state: ChatProjectionState) {
  return collectByIds(state.projectIds, state.projectById, EMPTY_PROJECTS)
}

export function selectChatSidebarThreads(state: ChatProjectionState): ChatThreadListProjection[] {
  return selectAllSidebarThreads(state)
}

export function selectChatSidebarThreadsForProject(
  state: ChatProjectionState,
  projectId: ProjectId | null | undefined,
): ChatThreadListProjection[] {
  if (!projectId) return EMPTY_THREAD_LIST

  return projectThreadListSelector(projectSidebarSelectors, projectId, false)(state)
}

/** Every registered thread, including archived rows, for the rail and command palette. */
export function selectChatSessionThreads(state: ChatProjectionState): ChatThreadListProjection[] {
  return selectAllSessionThreads(state)
}

export function selectChatSessionThreadsForProject(
  state: ChatProjectionState,
  projectId: ProjectId | null | undefined,
): ChatThreadListProjection[] {
  if (!projectId) return EMPTY_THREAD_LIST

  return projectThreadListSelector(projectSessionSelectors, projectId, true)(state)
}

/**
 * Creates a selector whose result changes only when a field a list can render changes.
 * The canonical record remains the sole owner; this is a memoized read projection, not
 * another store or synchronization path.
 */
export function createChatThreadListSelector({
  includeArchived,
  projectId,
}: {
  readonly includeArchived: boolean
  readonly projectId?: ProjectId
}): ChatThreadListSelector {
  let previous = EMPTY_THREAD_LIST

  return (state) => {
    const threadIds = projectId ? state.threadIdsByProjectId[projectId] : state.threadIds
    const previousById = new Map(previous.map((thread) => [thread.id, thread]))
    const next = (threadIds ?? []).flatMap((threadId) => {
      const thread = state.threadById[threadId]
      if (!thread) return []
      if (!includeArchived && thread.archivedAt) return []

      return [threadListProjection(thread, previousById.get(threadId))]
    })

    if (sameItems(previous, next)) return previous

    previous = next
    return next
  }
}

function projectThreadListSelector(
  selectors: Map<ProjectId, ChatThreadListSelector>,
  projectId: ProjectId,
  includeArchived: boolean,
) {
  const held = selectors.get(projectId)
  if (held) return held

  const created = createChatThreadListSelector({ includeArchived, projectId })
  selectors.set(projectId, created)

  return created
}

function threadListProjection(
  thread: ProjectionThread,
  previous: ChatThreadListProjection | undefined,
): ChatThreadListProjection {
  const activityAt = threadListActivityAt(thread)
  if (previous && listProjectionMatches(previous, thread, activityAt)) return previous

  return {
    activityAt,
    archivedAt: thread.archivedAt,
    branch: thread.branch,
    createdAt: thread.createdAt,
    hasActionableProposedPlan: thread.hasActionableProposedPlan,
    id: thread.id,
    latestTurn: thread.latestTurn,
    latestUserMessageAt: thread.latestUserMessageAt,
    pendingApprovalCount: thread.pendingApprovalCount,
    pendingUserInputCount: thread.pendingUserInputCount,
    pinOrderKey: thread.pinOrderKey,
    planProgress: thread.planProgress,
    projectId: thread.projectId,
    session: thread.session,
    title: thread.title,
    worktreePath: thread.worktreePath,
  }
}

function listProjectionMatches(
  previous: ChatThreadListProjection,
  thread: ProjectionThread,
  activityAt: string,
) {
  return (
    previous.activityAt === activityAt &&
    previous.archivedAt === thread.archivedAt &&
    previous.branch === thread.branch &&
    previous.createdAt === thread.createdAt &&
    previous.hasActionableProposedPlan === thread.hasActionableProposedPlan &&
    previous.id === thread.id &&
    previous.latestTurn === thread.latestTurn &&
    previous.latestUserMessageAt === thread.latestUserMessageAt &&
    previous.pendingApprovalCount === thread.pendingApprovalCount &&
    previous.pendingUserInputCount === thread.pendingUserInputCount &&
    previous.pinOrderKey === thread.pinOrderKey &&
    previous.planProgress === thread.planProgress &&
    previous.projectId === thread.projectId &&
    previous.session === thread.session &&
    previous.title === thread.title &&
    previous.worktreePath === thread.worktreePath
  )
}

function threadListActivityAt(thread: ProjectionThread) {
  return (
    thread.latestUserMessageAt ??
    thread.latestTurn?.completedAt ??
    thread.latestTurn?.requestedAt ??
    thread.updatedAt ??
    thread.createdAt
  )
}

function sameItems(
  previous: readonly ChatThreadListProjection[],
  next: readonly ChatThreadListProjection[],
) {
  if (previous.length !== next.length) return false

  return previous.every((thread, index) => thread === next[index])
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
