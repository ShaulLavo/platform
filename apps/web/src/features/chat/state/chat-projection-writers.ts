import {
  DEFAULT_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  type EventId,
  type OrchestrationCheckpointSummary,
  type OrchestrationEvent,
  type OrchestrationLatestTurn,
  type OrchestrationMessage,
  type OrchestrationProjectShell,
  type OrchestrationProposedPlan,
  type OrchestrationSession,
  type OrchestrationShellSnapshot,
  type OrchestrationShellStreamItem,
  ORCHESTRATION_THREAD_DETAIL_PAGE_SIZE,
  type OrchestrationThread,
  type OrchestrationThreadActivity,
  type OrchestrationThreadDetailPage,
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
  ChatTurnDiffSummary,
  ProjectionThread,
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
    ...retainSurvivingThreadSlices(state, nextThreadIds),
    bootstrapComplete: true,
    lastAppliedShellSequence: snapshot.snapshotSequence,
    lastAppliedShellUpdatedAt: snapshot.updatedAt,
    threadIds: [],
    threadIdsByProjectId: {},
  }

  for (const thread of snapshot.threads) {
    nextState = writeThreadFromShell(nextState, thread)
  }

  return nextState
}

export function syncChatProjectionThreadDetailSnapshot(
  state: ChatProjectionState,
  snapshot: OrchestrationThreadDetailSnapshot,
): ChatProjectionState {
  const threadId = snapshot.thread.id
  if (!shouldApplyThreadDetailSnapshot(state, threadId, snapshot.snapshotSequence)) return state

  const nextState = writeThreadDetailState(state, snapshot)

  return markThreadSequence(nextState, threadId, snapshot.snapshotSequence)
}

/**
 * Merges one backwards page in front of the thread's timeline. Rows already held
 * are dropped rather than re-inserted, so a page that overlaps the window — a
 * boundary row read twice, a page raced against a live append — is idempotent.
 */
export function prependChatProjectionThreadDetailPage(
  state: ChatProjectionState,
  page: OrchestrationThreadDetailPage,
): ChatProjectionState {
  const threadId = page.threadId
  const messages = prependUnheld(page.messages, selectMessages(state, threadId), messageKey)
  const activities = prependUnheld(page.activities, selectActivities(state, threadId), activityKey)
  const withRows = {
    ...state,
    activityByThreadId: {
      ...state.activityByThreadId,
      [threadId]: recordById(activities, activityKey),
    },
    activityIdsByThreadId: {
      ...state.activityIdsByThreadId,
      [threadId]: activities.map(activityKey),
    },
    messageByThreadId: {
      ...state.messageByThreadId,
      [threadId]: recordById(messages, messageKey),
    },
    messageIdsByThreadId: {
      ...state.messageIdsByThreadId,
      [threadId]: messages.map(messageKey),
    },
  }

  return writeThreadHasEarlier(withRows, threadId, page.hasEarlier)
}

function prependUnheld<TValue, TKey extends string>(
  older: readonly TValue[],
  held: readonly TValue[],
  getKey: (value: TValue) => TKey,
): TValue[] {
  const heldKeys = new Set(held.map(getKey))

  return [...older.filter((value) => !heldKeys.has(getKey(value))), ...held]
}

function messageKey(message: OrchestrationMessage) {
  return message.id
}

function activityKey(activity: OrchestrationThreadActivity) {
  return activity.id
}

/**
 * The cache limit bounds what the live stream may grow to on its own; it must
 * not shrink a transcript the user explicitly paged back into, so an already
 * expanded thread keeps its length and slides forward instead. Either way the
 * trim is recoverable: the earlier-page boundary is derived from the oldest row
 * still held, so a trimmed row is one "load earlier" away rather than lost.
 */
function boundedTail<TValue>(rows: TValue[], limit: number, heldCount: number): TValue[] {
  const max = Math.max(limit, heldCount)
  if (rows.length <= max) return rows

  return rows.slice(-max)
}

function markTrimmedFront(
  state: ChatProjectionState,
  threadId: ThreadId,
  trimmedCount: number,
): ChatProjectionState {
  if (trimmedCount <= 0) return state

  return writeThreadHasEarlier(state, threadId, true)
}

function writeThreadHasEarlier(
  state: ChatProjectionState,
  threadId: ThreadId,
  hasEarlier: boolean,
): ChatProjectionState {
  if (state.threadHasEarlierById[threadId] === hasEarlier) return state

  return {
    ...state,
    threadHasEarlierById: {
      ...state.threadHasEarlierById,
      [threadId]: hasEarlier,
    },
  }
}

/**
 * Everything a surviving thread owns crosses a shell resnapshot; everything a thread
 * the snapshot no longer lists owns is dropped. `threadById` is in here because the
 * record carries facts no shell write can refresh — the arranged pin slot, and the
 * `pendingSourceProposedPlan` whose event the retained detail cursor guarantees is
 * never replayed, so wiping it would lose the plan banner until the next turn.
 */
function retainSurvivingThreadSlices(state: ChatProjectionState, threadIds: ReadonlySet<ThreadId>) {
  return {
    activityByThreadId: retainThreadScopedRecord(state.activityByThreadId, threadIds),
    activityIdsByThreadId: retainThreadScopedRecord(state.activityIdsByThreadId, threadIds),
    messageByThreadId: retainThreadScopedRecord(state.messageByThreadId, threadIds),
    messageIdsByThreadId: retainThreadScopedRecord(state.messageIdsByThreadId, threadIds),
    proposedPlanByThreadId: retainThreadScopedRecord(state.proposedPlanByThreadId, threadIds),
    proposedPlanIdsByThreadId: retainThreadScopedRecord(state.proposedPlanIdsByThreadId, threadIds),
    threadById: retainThreadScopedRecord(state.threadById, threadIds),
    threadDetailSequenceById: retainThreadScopedRecord(state.threadDetailSequenceById, threadIds),
    threadHasEarlierById: retainThreadScopedRecord(state.threadHasEarlierById, threadIds),
    turnDiffIdsByThreadId: retainThreadScopedRecord(state.turnDiffIdsByThreadId, threadIds),
    turnDiffSummaryByThreadId: retainThreadScopedRecord(state.turnDiffSummaryByThreadId, threadIds),
  }
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
      return writeThreadFromShell(state, item.thread)
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
        // A project is never born arranged: it sorts oldest-first at the tail
        // until the user drags it, and only `project.reordered` writes a key.
        orderKey: null,
        scripts: [],
        title: event.payload.title,
        updatedAt: event.payload.updatedAt,
        workspaceRoot: event.payload.workspaceRoot,
      })
    case 'project.meta-updated':
      return patchProject(state, event.payload.projectId, {
        defaultModelSelection: event.payload.defaultModelSelection,
        scripts: event.payload.scripts,
        title: event.payload.title,
        updatedAt: event.payload.updatedAt,
        workspaceRoot: event.payload.workspaceRoot,
      })
    case 'project.reordered':
      return patchProject(state, event.payload.projectId, { orderKey: event.payload.orderKey })
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
      return patchThread(state, event.payload.threadId, {
        archivedAt: event.payload.archivedAt,
        updatedAt: event.payload.updatedAt,
      })
    case 'thread.unarchived':
      return patchThread(state, event.payload.threadId, {
        archivedAt: null,
        updatedAt: event.payload.updatedAt,
      })
    case 'thread.meta-updated':
      return applyThreadMetaUpdatedEvent(state, event)
    case 'thread.runtime-mode-set':
      return patchThread(state, event.payload.threadId, {
        runtimeMode: event.payload.runtimeMode,
        updatedAt: event.payload.updatedAt,
      })
    case 'thread.interaction-mode-set':
      return patchThread(state, event.payload.threadId, {
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
    // The arranged slot is the one piece of pin state the rail draws, and the
    // shell snapshot does not carry it — these events are the only producer.
    case 'thread.pinned':
      return writeThreadPinOrderKey(
        state,
        event.payload.threadId,
        event.payload.pinOrderKey ?? null,
      )
    case 'thread.unpinned':
      return writeThreadPinOrderKey(state, event.payload.threadId, null)
    case 'thread.pin-reordered':
      return writeThreadPinOrderKey(state, event.payload.threadId, event.payload.orderKey)
    // Settle and snooze live on the server thread row; the shell snapshot the
    // client projects does not carry those fields, so there is nothing here to
    // patch. `updatedAt` deliberately stays untouched — bumping it from an
    // event whose state the client cannot see would reorder the rail for a
    // change nothing renders.
    case 'thread.settled':
    case 'thread.unsettled':
    case 'thread.snoozed':
    case 'thread.unsnoozed':
      return state
  }
}

/**
 * The arranged slot has no shell producer, so it is written here and carried across
 * resnapshots by `threadFromShell`.
 */
function writeThreadPinOrderKey(
  state: ChatProjectionState,
  threadId: ThreadId,
  pinOrderKey: string | null,
): ChatProjectionState {
  const thread = state.threadById[threadId]
  if (!thread) return state
  if (thread.pinOrderKey === pinOrderKey) return state

  return {
    ...state,
    threadById: {
      ...state.threadById,
      [threadId]: { ...thread, pinOrderKey },
    },
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

function writeThreadFromShell(
  state: ChatProjectionState,
  thread: OrchestrationThreadShell,
): ChatProjectionState {
  const previous = state.threadById[thread.id]
  const nextState = ensureThreadRegistered(state, thread.id, thread.projectId, previous?.projectId)

  return {
    ...nextState,
    threadById: {
      ...nextState.threadById,
      [thread.id]: threadFromShell(thread, previous),
    },
  }
}

/**
 * The shell is the whole truth for everything it publishes. The three client-only
 * facts have no shell producer, so they are carried across explicitly — a resnapshot
 * that dropped them would lose the arranged pin slot and the plan banner.
 */
function threadFromShell(
  thread: OrchestrationThreadShell,
  previous: ProjectionThread | undefined,
): ProjectionThread {
  return {
    archivedAt: thread.archivedAt,
    branch: thread.branch,
    createdAt: thread.createdAt,
    detailSynced: previous?.detailSynced ?? false,
    hasActionableProposedPlan: thread.hasActionableProposedPlan,
    id: thread.id,
    interactionMode: thread.interactionMode,
    latestTurn: thread.latestTurn,
    latestUserMessageAt: thread.latestUserMessageAt,
    liveTurn: thread.latestTurn,
    metaSource: 'shell',
    modelSelection: thread.modelSelection,
    pendingApprovalCount: thread.pendingApprovalCount,
    pendingSourceProposedPlan: carriedPendingSourcePlan(previous, thread.latestTurn),
    pendingUserInputCount: thread.pendingUserInputCount,
    pinOrderKey: previous?.pinOrderKey ?? null,
    planProgress: thread.planProgress,
    projectId: thread.projectId,
    runtimeMode: thread.runtimeMode,
    session: thread.session,
    sessionKnown: true,
    title: thread.title,
    updatedAt: thread.updatedAt,
    worktreePath: thread.worktreePath,
  }
}

/**
 * Detail slices only. The shell records this used to write are shell-authoritative,
 * and the two subscriptions are independent, so a detail cached before a reconnect
 * could otherwise revert a newer branch/worktree/title/session. Plans and checkpoints
 * are replaced rather than merged: a snapshot is the whole truth for them, and a plan
 * resolved while disconnected leaves no event behind to remove it.
 */
function writeThreadDetailState(
  state: ChatProjectionState,
  snapshot: OrchestrationThreadDetailSnapshot,
): ChatProjectionState {
  const thread = snapshot.thread
  const activitySlice = buildActivitySlice(thread.activities)
  const messageSlice = buildMessageSlice(thread.messages)
  const planSlice = buildProposedPlanSlice(snapshot.proposedPlans)
  const turnDiffSlice = buildTurnDiffSlice(thread.id, snapshot.checkpoints)

  return writeThreadHasEarlier(
    {
      ...state,
      activityByThreadId: {
        ...state.activityByThreadId,
        [thread.id]: activitySlice.byId,
      },
      activityIdsByThreadId: {
        ...state.activityIdsByThreadId,
        [thread.id]: activitySlice.ids,
      },
      messageByThreadId: {
        ...state.messageByThreadId,
        [thread.id]: messageSlice.byId,
      },
      messageIdsByThreadId: {
        ...state.messageIdsByThreadId,
        [thread.id]: messageSlice.ids,
      },
      proposedPlanByThreadId: {
        ...state.proposedPlanByThreadId,
        [thread.id]: planSlice.byId,
      },
      proposedPlanIdsByThreadId: {
        ...state.proposedPlanIdsByThreadId,
        [thread.id]: planSlice.ids,
      },
      threadById: {
        ...state.threadById,
        [thread.id]: threadFromDetail(thread, state.threadById[thread.id]),
      },
      turnDiffIdsByThreadId: {
        ...state.turnDiffIdsByThreadId,
        [thread.id]: turnDiffSlice.ids,
      },
      turnDiffSummaryByThreadId: {
        ...state.turnDiffSummaryByThreadId,
        [thread.id]: turnDiffSlice.byId,
      },
    },
    thread.id,
    snapshotWindowFull(thread),
  )
}

/**
 * A full window is the only truncation signal a detail snapshot carries: the
 * server ships the newest `ORCHESTRATION_THREAD_DETAIL_PAGE_SIZE` rows of each
 * stream, so a short window proves the thread has nothing earlier, and a full
 * one leaves it to the first backwards page to settle.
 */
function snapshotWindowFull(thread: OrchestrationThread) {
  return (
    thread.messages.length >= ORCHESTRATION_THREAD_DETAIL_PAGE_SIZE ||
    thread.activities.length >= ORCHESTRATION_THREAD_DETAIL_PAGE_SIZE
  )
}

/**
 * Creation is a shell fact — the thread joins the rail and the project index here.
 * It arrives ahead of the shell stream on the post-dispatch replay path, which is the
 * only reason a brand new thread is visible before its first shell snapshot.
 */
function writeCreatedThread(
  state: ChatProjectionState,
  event: Extract<OrchestrationEvent, { type: 'thread.created' }>,
): ChatProjectionState {
  return writeThreadFromShell(state, {
    archivedAt: null,
    branch: event.payload.branch,
    createdAt: event.payload.createdAt,
    hasActionableProposedPlan: false,
    id: event.payload.threadId,
    interactionMode: event.payload.interactionMode ?? DEFAULT_INTERACTION_MODE,
    latestTurn: null,
    latestUserMessageAt: null,
    modelSelection: event.payload.modelSelection,
    pendingApprovalCount: 0,
    pendingUserInputCount: 0,
    projectId: event.payload.projectId,
    runtimeMode: event.payload.runtimeMode ?? DEFAULT_RUNTIME_MODE,
    session: null,
    title: event.payload.title,
    updatedAt: event.payload.updatedAt,
    worktreePath: event.payload.worktreePath,
  })
}

function applyThreadMetaUpdatedEvent(
  state: ChatProjectionState,
  event: Extract<OrchestrationEvent, { type: 'thread.meta-updated' }>,
): ChatProjectionState {
  return patchThread(state, event.payload.threadId, {
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

  const nextState = patchThread(state, event.payload.threadId, {
    interactionMode: event.payload.interactionMode,
    modelSelection: event.payload.modelSelection,
    runtimeMode: event.payload.runtimeMode,
    updatedAt: event.payload.createdAt,
  })

  return writeThreadTurn(nextState, event.payload.threadId, {
    liveTurn: latestTurn,
    pendingSourceProposedPlan: event.payload.sourceProposedPlan,
  })
}

function applyThreadTurnInterruptRequestedEvent(
  state: ChatProjectionState,
  event: Extract<OrchestrationEvent, { type: 'thread.turn-interrupt-requested' }>,
): ChatProjectionState {
  const thread = state.threadById[event.payload.threadId]
  if (!event.payload.turnId || !thread?.liveTurn) return state
  if (thread.liveTurn.turnId !== event.payload.turnId) return state

  return writeThreadTurn(state, event.payload.threadId, {
    liveTurn: {
      ...thread.liveTurn,
      completedAt: thread.liveTurn.completedAt ?? event.payload.createdAt,
      startedAt: thread.liveTurn.startedAt ?? event.payload.createdAt,
      state: 'interrupted',
    },
    pendingSourceProposedPlan: thread.pendingSourceProposedPlan,
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

  const status = event.payload.session.status
  if (status !== 'running' && status !== 'waiting') return nextState
  if (event.payload.session.activeTurnId === null) return nextState

  const currentTurn = nextState.threadById[event.payload.threadId]?.liveTurn
  const activeTurnId = event.payload.session.activeTurnId

  return writeThreadTurn(nextState, event.payload.threadId, {
    liveTurn: {
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
    pendingSourceProposedPlan: undefined,
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
  const heldMessage = currentById[message.id]
  const nextMessage = mergeMessage(heldMessage, message)
  // The id list and the by-id record are written together by every writer in
  // this file, so record membership *is* the id-list membership test. A streamed
  // delta re-sends an id that is already held, and this runs once per token: a
  // linear `includes` over the retained transcript is the wrong instrument.
  const appendedIds = heldMessage ? currentIds : [...currentIds, message.id]
  const nextIds = boundedTail(appendedIds, CHAT_MESSAGE_CACHE_LIMIT, currentIds.length)
  const grownById = {
    ...currentById,
    [message.id]: nextMessage,
  }
  // Only a trim can drop keys, and the steady-state delta never trims — so the
  // record rebuild is paid on the rare append that crosses the cap, not per token.
  const nextById =
    nextIds.length === appendedIds.length
      ? grownById
      : retainRecordKeys(grownById, new Set(nextIds))

  const nextState = patchThread(
    markTrimmedFront(
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
      appendedIds.length - nextIds.length,
    ),
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
  const currentIds = state.activityIdsByThreadId[threadId] ?? []
  const currentById = state.activityByThreadId[threadId] ?? {}
  const appended = appendActivity(currentIds, currentById, activity)
  const nextIds = boundedTail(appended.ids, CHAT_ACTIVITY_CACHE_LIMIT, currentIds.length)
  const nextById =
    nextIds.length === appended.ids.length
      ? appended.byId
      : retainRecordKeys(appended.byId, new Set(nextIds))

  return writeTurnFailureState(
    markTrimmedFront(
      {
        ...patchThread(state, threadId, { updatedAt: activity.createdAt }),
        activityByThreadId: {
          ...state.activityByThreadId,
          [threadId]: nextById,
        },
        activityIdsByThreadId: {
          ...state.activityIdsByThreadId,
          [threadId]: nextIds,
        },
      },
      threadId,
      appended.ids.length - nextIds.length,
    ),
    activity,
  )
}

/**
 * Activities arrive in `sequence` order, so the append is a tail push. The full
 * rebuild-and-sort is kept for the cases that are not a tail push — an id already
 * held (a revision), an out-of-order replay, or a snapshot row carrying no
 * `sequence` (which `compareActivities` sorts last) — so as long as the held
 * slice is already sorted, the order this produces is identical to sorting every
 * time. The slice is sorted by construction: every writer that builds it either
 * sorts or takes the server's order.
 */
function appendActivity(
  ids: readonly EventId[],
  byId: Record<EventId, OrchestrationThreadActivity>,
  activity: OrchestrationThreadActivity,
): { byId: Record<EventId, OrchestrationThreadActivity>; ids: EventId[] } {
  const lastId = ids.at(-1)
  const last = lastId ? byId[lastId] : undefined
  const isTailAppend =
    byId[activity.id] === undefined && (!last || compareActivities(last, activity) < 0)
  if (isTailAppend) {
    return {
      byId: { ...byId, [activity.id]: activity },
      ids: [...ids, activity.id],
    }
  }

  const ordered = recordValues<OrchestrationThreadActivity>({
    ...byId,
    [activity.id]: activity,
  }).sort(compareActivities)

  return {
    byId: recordById(ordered, activityKey),
    ids: ordered.map(activityKey),
  }
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
    .toSorted(compareProposedPlans)
    .slice(-CHAT_PROPOSED_PLAN_CACHE_LIMIT)

  return {
    ...patchThread(state, threadId, {
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
    ...patchThread(state, threadId, { updatedAt: event.payload.completedAt }),
    turnDiffIdsByThreadId: {
      ...state.turnDiffIdsByThreadId,
      [threadId]: summaries.map((entry) => entry.turnId),
    },
    turnDiffSummaryByThreadId: {
      ...state.turnDiffSummaryByThreadId,
      [threadId]: recordById(summaries, (entry) => entry.turnId),
    },
  }

  return writeThreadTurn(nextState, threadId, {
    liveTurn: {
      assistantMessageId: event.payload.assistantMessageId,
      completedAt: event.payload.completedAt,
      requestedAt: state.threadById[threadId]?.liveTurn?.requestedAt ?? event.payload.completedAt,
      startedAt: state.threadById[threadId]?.liveTurn?.startedAt ?? event.payload.completedAt,
      state: checkpointStatusToLatestTurnState(event.payload.status),
      turnId: event.payload.turnId,
    },
    pendingSourceProposedPlan: undefined,
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
  const latestSummary = summaries.at(-1)

  return writeThreadTurn(
    {
      ...patchThread(state, threadId, { updatedAt: event.payload.revertedAt }),
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
    },
    threadId,
    {
      liveTurn: latestSummary ? latestTurnFromSummary(latestSummary) : null,
      pendingSourceProposedPlan: undefined,
    },
  )
}

function latestTurnFromSummary(summary: ChatTurnDiffSummary): OrchestrationLatestTurn {
  return {
    assistantMessageId: summary.assistantMessageId,
    completedAt: summary.completedAt,
    requestedAt: summary.completedAt,
    startedAt: summary.completedAt,
    state: checkpointStatusToLatestTurnState(summary.status),
    turnId: summary.turnId,
  }
}

function writeThreadSession(
  state: ChatProjectionState,
  threadId: ThreadId,
  session: OrchestrationSession | null,
): ChatProjectionState {
  const thread = state.threadById[threadId]
  // A session for a thread the projection has never seen had no reader before either:
  // `selectChatThreadById` resolves nothing without a thread record. Dropping it keeps
  // every record complete instead of half-born.
  if (!thread) return state

  return {
    ...state,
    threadById: {
      ...state.threadById,
      [threadId]: { ...thread, session, sessionKnown: true },
    },
  }
}

function carriedPendingSourcePlan(
  previous: ProjectionThread | undefined,
  latestTurn: OrchestrationLatestTurn | null,
) {
  if (latestTurn?.sourceProposedPlan) return latestTurn.sourceProposedPlan
  if (!previous?.pendingSourceProposedPlan) return undefined
  // Only the turn the plan was implemented by carries it. A newer turn drops it, or a
  // resolved plan would pin the thread's detail subscription against eviction forever.
  if (previous.liveTurn?.turnId !== latestTurn?.turnId) return undefined

  return previous.pendingSourceProposedPlan
}

/**
 * Both fields are required on purpose. The old turn-state record was *replaced*
 * wholesale by every writer, so omitting `pendingSourceProposedPlan` cleared it and
 * nothing said so. Spreading onto one record would silently preserve it instead, so
 * the type forces each caller to state which it means.
 */
type ThreadTurnWrite = {
  liveTurn: OrchestrationLatestTurn | null
  pendingSourceProposedPlan: OrchestrationLatestTurn['sourceProposedPlan'] | undefined
}

function writeThreadTurn(
  state: ChatProjectionState,
  threadId: ThreadId,
  turn: ThreadTurnWrite,
): ChatProjectionState {
  const thread = state.threadById[threadId]
  if (!thread) return state

  return {
    ...state,
    threadById: {
      ...state.threadById,
      [threadId]: { ...thread, ...turn },
    },
  }
}

function writeTurnFailureState(
  state: ChatProjectionState,
  activity: OrchestrationThreadActivity,
): ChatProjectionState {
  if (!isProviderTurnFailureActivity(activity.kind)) return state
  if (!activity.turnId) return state

  const thread = state.threadById[activity.threadId]
  const latestTurn = thread?.liveTurn
  if (!latestTurn) return state
  if (latestTurn.turnId !== activity.turnId) return state

  return writeThreadTurn(state, activity.threadId, {
    liveTurn: {
      ...latestTurn,
      completedAt: latestTurn.completedAt ?? activity.createdAt,
      startedAt: latestTurn.startedAt ?? activity.createdAt,
      state: 'error',
    },
    pendingSourceProposedPlan: thread.pendingSourceProposedPlan,
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
  const current = state.threadById[threadId]
  const latestTurn = current?.liveTurn
  if (latestTurn?.turnId && latestTurn.turnId !== event.payload.turnId) return state

  return writeThreadTurn(state, threadId, {
    liveTurn: {
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

function patchThread(
  state: ChatProjectionState,
  threadId: ThreadId,
  patch: Partial<ProjectionThread>,
): ChatProjectionState {
  const thread = state.threadById[threadId]
  if (!thread) return state

  const nextThread = compactUpdate(thread, patch)
  if (nextThread === thread) return state

  return {
    ...state,
    threadById: {
      ...state.threadById,
      [threadId]: nextThread,
    },
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
    threadById: removeRecordKey(state.threadById, threadId),
    threadDetailSequenceById: removeRecordKey(state.threadDetailSequenceById, threadId),
    threadHasEarlierById: removeRecordKey(state.threadHasEarlierById, threadId),
    threadIds: removeId(state.threadIds, threadId),
    threadIdsByProjectId: removeThreadFromAllProjectIndexes(state.threadIdsByProjectId, threadId),
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

/**
 * The detail subscription is the weaker producer. Both subscriptions run
 * independently, so a detail snapshot cached before a reconnect can land after a
 * newer shell one — it therefore fills in only what nothing authoritative has
 * published yet. `metaSource` decides the meta group all-or-nothing (never per
 * field: the shell publishes them as one row and mixing halves of two rows is how
 * a stale branch ends up next to a fresh worktree), and `sessionKnown` decides the
 * session by presence, because `null` is a real session value.
 *
 * The thread is deliberately *not* registered in `threadIds` here: a thread the
 * shell has not delivered is resolvable by id but is not a rail row.
 */
function threadFromDetail(
  thread: OrchestrationThread,
  previous: ProjectionThread | undefined,
): ProjectionThread {
  if (previous?.metaSource === 'shell') {
    return {
      ...previous,
      detailSynced: true,
      liveTurn: previous.liveTurn ?? thread.latestTurn,
    }
  }

  return {
    archivedAt: thread.archivedAt,
    branch: thread.branch,
    createdAt: thread.createdAt,
    detailSynced: true,
    // Shell-only counters: nothing authoritative has published this thread, so they
    // stand at their zero values and `selectChatThreadById` derives the plan flag
    // from the plans it holds instead.
    hasActionableProposedPlan: false,
    id: thread.id,
    interactionMode: thread.interactionMode ?? DEFAULT_INTERACTION_MODE,
    latestTurn: thread.latestTurn,
    latestUserMessageAt: null,
    liveTurn: previous?.liveTurn ?? thread.latestTurn,
    metaSource: 'detail',
    modelSelection: thread.modelSelection,
    pendingApprovalCount: 0,
    pendingSourceProposedPlan: previous?.pendingSourceProposedPlan,
    pendingUserInputCount: 0,
    pinOrderKey: previous?.pinOrderKey ?? null,
    planProgress: null,
    projectId: thread.projectId,
    runtimeMode: thread.runtimeMode ?? DEFAULT_RUNTIME_MODE,
    session: previous?.sessionKnown ? previous.session : thread.session,
    sessionKnown: previous?.sessionKnown ?? false,
    title: thread.title,
    updatedAt: thread.updatedAt,
    worktreePath: thread.worktreePath,
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

function buildProposedPlanSlice(plans: OrchestrationProposedPlan[]) {
  const orderedPlans = plans.toSorted(compareProposedPlans).slice(-CHAT_PROPOSED_PLAN_CACHE_LIMIT)

  return {
    byId: recordById(orderedPlans, (plan) => plan.id),
    ids: orderedPlans.map((plan) => plan.id),
  }
}

function buildTurnDiffSlice(threadId: ThreadId, checkpoints: OrchestrationCheckpointSummary[]) {
  const summaries = checkpoints
    .map((checkpoint): ChatTurnDiffSummary => ({ ...checkpoint, threadId }))
    .toSorted((left, right) => left.checkpointTurnCount - right.checkpointTurnCount)
    .slice(-CHAT_CHECKPOINT_CACHE_LIMIT)

  return {
    byId: recordById(summaries, (summary) => summary.turnId),
    ids: summaries.map((summary) => summary.turnId),
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

function compareActivities(left: OrchestrationThreadActivity, right: OrchestrationThreadActivity) {
  const leftSequence = left.sequence ?? Number.MAX_SAFE_INTEGER
  const rightSequence = right.sequence ?? Number.MAX_SAFE_INTEGER

  return (
    leftSequence - rightSequence ||
    left.createdAt.localeCompare(right.createdAt) ||
    left.id.localeCompare(right.id)
  )
}

function compareProposedPlans(left: OrchestrationProposedPlan, right: OrchestrationProposedPlan) {
  return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)
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
