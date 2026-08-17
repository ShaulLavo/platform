import type { OrchestrationEvent, OrchestrationMessage } from './schemas'
import type { OrchestrationSession } from '@workspace/contracts'
import { isPendingRequestActivityKind, pendingRequestCounts } from './pending-requests'
import {
  appendBounded,
  boundCheckpoints,
  createEmptyReadModel,
  MAX_THREAD_ACTIVITIES,
  MAX_THREAD_MESSAGES,
  mergedMessageText,
  settledTurnStateForSessionStatus,
  settleRunningTurn,
  setLatestTurnState,
  setThreadSession,
  type OrchestrationProjectedThread,
  type OrchestrationReadModel,
} from './read-model'

type LatestTurnState = NonNullable<OrchestrationProjectedThread['latestTurn']>['state']

/**
 * Projects in place. The read model is engine-private and every consumer reads
 * it through `getReadModel()` at the moment of use, so nobody held the old
 * value — the per-event deep clone only copied every message and activity of
 * every thread, which made dispatch cost grow with thread length.
 */
export function projectEvents(events: OrchestrationEvent[], model = createEmptyReadModel()) {
  for (const event of events) {
    model.sequence = Math.max(model.sequence, event.sequence)
    applyEvent(event, model)
  }

  return model
}

function applyEvent(event: OrchestrationEvent, model: OrchestrationReadModel) {
  switch (event.type) {
    case 'project.created':
      model.projects.set(event.payload.projectId, {
        defaultModelSelection: event.payload.defaultModelSelection,
        deletedAt: null,
        id: event.payload.projectId,
        orderKey: null,
        scripts: [],
        title: event.payload.title,
        workspaceRoot: event.payload.workspaceRoot,
        createdAt: event.payload.createdAt,
        updatedAt: event.payload.updatedAt,
      })
      return
    case 'project.meta-updated':
      updateProject(event, model)
      return
    case 'project.reordered':
      updateProjectValue(model, event.payload.projectId, { orderKey: event.payload.orderKey })
      return
    case 'project.deleted':
      updateProjectValue(model, event.payload.projectId, {
        deletedAt: event.payload.deletedAt,
        updatedAt: event.payload.deletedAt,
      })
      return
    case 'thread.created':
      model.threads.set(event.payload.threadId, createdThread(event))
      return
    case 'thread.message-sent':
      upsertMessage(event, model)
      return
    case 'thread.turn-start-requested':
      startTurn(event, model)
      return
    case 'thread.session-set':
      updateThread(model, event.payload.threadId, (thread) =>
        threadAfterSessionSet(thread, event.payload.session),
      )
      return
    case 'thread.activity-appended':
      updateThread(model, event.payload.threadId, (thread) => threadAfterActivity(thread, event))
      return
    case 'thread.meta-updated':
      updateThreadMeta(event, model)
      return
    case 'thread.deleted':
      updateThreadValue(model, event.payload.threadId, {
        deletedAt: event.payload.deletedAt,
        updatedAt: event.payload.deletedAt,
      })
      return
    case 'thread.archived':
      updateThreadValue(model, event.payload.threadId, {
        archivedAt: event.payload.archivedAt,
        updatedAt: event.payload.updatedAt,
      })
      return
    case 'thread.unarchived':
      updateThreadValue(model, event.payload.threadId, {
        archivedAt: null,
        updatedAt: event.payload.updatedAt,
      })
      return
    case 'thread.settled':
      updateThreadValue(model, event.payload.threadId, {
        settledAt: event.payload.settledAt,
        settledOverride: 'settled',
        updatedAt: event.payload.updatedAt,
      })
      return
    case 'thread.unsettled':
      // "user" is the un-settle button — an explicit keep-active override.
      // "activity" is the server resetting to neutral so the thread can settle
      // on its own again once this burst of work goes stale.
      updateThreadValue(model, event.payload.threadId, {
        settledAt: null,
        settledOverride: event.payload.reason === 'user' ? 'active' : null,
        updatedAt: event.payload.updatedAt,
      })
      return
    case 'thread.snoozed':
      updateThreadValue(model, event.payload.threadId, {
        snoozedAt: event.payload.snoozedAt,
        snoozedUntil: event.payload.snoozedUntil,
        updatedAt: event.payload.updatedAt,
      })
      return
    case 'thread.unsnoozed':
      updateThreadValue(model, event.payload.threadId, {
        snoozedAt: null,
        snoozedUntil: null,
        updatedAt: event.payload.updatedAt,
      })
      return
    case 'thread.pinned':
      updateThreadValue(model, event.payload.threadId, {
        pinOrderKey: event.payload.pinOrderKey,
        pinnedAt: event.payload.pinnedAt,
        updatedAt: event.payload.updatedAt,
      })
      return
    case 'thread.unpinned':
      updateThreadValue(model, event.payload.threadId, {
        pinOrderKey: null,
        pinnedAt: null,
        updatedAt: event.payload.updatedAt,
      })
      return
    case 'thread.pin-reordered':
      updateThreadValue(model, event.payload.threadId, {
        pinOrderKey: event.payload.orderKey,
        updatedAt: event.payload.updatedAt,
      })
      return
    case 'thread.runtime-mode-set':
      updateThreadValue(model, event.payload.threadId, {
        runtimeMode: event.payload.runtimeMode,
        updatedAt: event.payload.updatedAt,
      })
      return
    case 'thread.interaction-mode-set':
      updateThreadValue(model, event.payload.threadId, {
        interactionMode: event.payload.interactionMode,
        updatedAt: event.payload.updatedAt,
      })
      return
    case 'thread.turn-interrupt-requested':
      updateThread(model, event.payload.threadId, (thread) =>
        setLatestTurnState(thread, 'interrupted', event.payload.createdAt),
      )
      return
    case 'thread.turn-diff-completed':
      updateThread(model, event.payload.threadId, (thread) => threadAfterCheckpoint(thread, event))
      return
    case 'thread.session-stop-requested':
      updateThread(model, event.payload.threadId, (thread) =>
        threadAfterSessionStop(thread, event.payload.createdAt),
      )
      return
    case 'thread.proposed-plan-upserted':
      // Derived, never latched: a plan that already carries an implementation
      // stamp is history, not an offer.
      updateThreadValue(model, event.payload.threadId, {
        hasActionableProposedPlan: !event.payload.proposedPlan.implementedAt,
      })
      return
    case 'thread.checkpoint-revert-requested':
      return
    case 'thread.reverted':
      updateThread(model, event.payload.threadId, (thread) => revertedThread(thread, event))
      return
    case 'thread.approval-response-requested':
    case 'thread.user-input-response-requested':
      return
  }
}

function startTurn(
  event: Extract<OrchestrationEvent, { type: 'thread.turn-start-requested' }>,
  model: OrchestrationReadModel,
) {
  updateThread(model, event.payload.threadId, (thread) => ({
    ...thread,
    interactionMode: event.payload.interactionMode ?? thread.interactionMode,
    // The turn carries the model it will actually run on; without this the read
    // model keeps reporting whatever the thread was created with.
    modelSelection: event.payload.modelSelection ?? thread.modelSelection,
    latestTurn: {
      assistantMessageId: null,
      completedAt: null,
      requestedAt: event.payload.createdAt,
      sourceProposedPlan: event.payload.sourceProposedPlan,
      startedAt: null,
      state: 'running' as const,
      turnId: event.payload.turnId,
    },
    runtimeMode: event.payload.runtimeMode ?? thread.runtimeMode,
    updatedAt: event.payload.createdAt,
  }))

  const source = event.payload.sourceProposedPlan
  if (!source) return

  // Starting a turn from a plan is the moment it stops being actionable, and
  // the plan can live on another thread than the one running the turn.
  updateThreadValue(model, source.threadId, { hasActionableProposedPlan: false })
}

function threadAfterCheckpoint(
  thread: OrchestrationProjectedThread,
  event: Extract<OrchestrationEvent, { type: 'thread.turn-diff-completed' }>,
): OrchestrationProjectedThread {
  const existing = thread.checkpointByTurnId[event.payload.turnId]
  // Mid-turn diff updates carry a placeholder ref with status "missing". Once a
  // real capture has landed, a later placeholder must change nothing at all.
  if (existing && existing.status !== 'missing' && event.payload.status === 'missing') return thread

  const withCheckpoint = {
    ...thread,
    checkpointByTurnId: boundCheckpoints({
      ...thread.checkpointByTurnId,
      [event.payload.turnId]: {
        assistantMessageId: event.payload.assistantMessageId,
        checkpointRef: event.payload.checkpointRef,
        checkpointTurnCount: event.payload.checkpointTurnCount,
        completedAt: event.payload.completedAt,
        status: event.payload.status,
        turnId: event.payload.turnId,
      },
    }),
  }
  // Recording a checkpoint is not a turn ending: a placeholder arrives while
  // the session is still streaming the very turn it describes.
  if (isSessionRunningTurn(thread.session, event.payload.turnId)) return withCheckpoint

  return setLatestTurnState(
    withCheckpoint,
    event.payload.status === 'error' ? 'error' : 'completed',
    event.payload.completedAt,
    event.payload.assistantMessageId,
  )
}

function isSessionRunningTurn(session: OrchestrationSession | null, turnId: string) {
  if (session?.status !== 'running' && session?.status !== 'waiting') return false

  return session.activeTurnId === turnId
}

function createdThread(event: Extract<OrchestrationEvent, { type: 'thread.created' }>) {
  return {
    activities: [],
    archivedAt: null,
    branch: event.payload.branch,
    checkpointByTurnId: {},
    createdAt: event.payload.createdAt,
    deletedAt: null,
    hasActionableProposedPlan: false,
    id: event.payload.threadId,
    interactionMode: event.payload.interactionMode,
    latestTurn: null,
    latestUserMessageAt: null,
    messages: [],
    modelSelection: event.payload.modelSelection,
    pendingApprovalCount: 0,
    pendingUserInputCount: 0,
    pinOrderKey: null,
    pinnedAt: null,
    projectId: event.payload.projectId,
    runtimeMode: event.payload.runtimeMode,
    session: null,
    settledAt: null,
    settledOverride: null,
    snoozedAt: null,
    snoozedUntil: null,
    title: event.payload.title,
    updatedAt: event.payload.updatedAt,
    worktreePath: event.payload.worktreePath,
  } satisfies OrchestrationProjectedThread
}

function revertedThread(
  thread: OrchestrationProjectedThread,
  event: Extract<OrchestrationEvent, { type: 'thread.reverted' }>,
): OrchestrationProjectedThread {
  const checkpoints = retainedCheckpoints(thread, event.payload.turnCount)
  const retainedTurnIds = new Set(checkpoints.map((checkpoint) => checkpoint.turnId))
  const activities = thread.activities.filter((activity) =>
    shouldRetainAfterRevert(activity.turnId, retainedTurnIds),
  )
  // Requests pruned with their turns must not keep the thread flagged as
  // waiting, and a retained request must survive the revert.
  const counts = pendingRequestCounts(activities)

  return {
    ...thread,
    activities,
    checkpointByTurnId: recordByTurnId(checkpoints),
    hasActionableProposedPlan: false,
    latestTurn: latestTurnAfterRevert(thread.latestTurn, checkpoints, retainedTurnIds),
    messages: thread.messages.filter((message) =>
      shouldRetainAfterRevert(message.turnId, retainedTurnIds),
    ),
    pendingApprovalCount: counts.approvals,
    pendingUserInputCount: counts.userInputs,
    updatedAt: event.payload.revertedAt,
  }
}

function retainedCheckpoints(thread: OrchestrationProjectedThread, turnCount: number) {
  return Object.values(thread.checkpointByTurnId)
    .filter((checkpoint) => checkpoint.checkpointTurnCount <= turnCount)
    .toSorted((left, right) => left.checkpointTurnCount - right.checkpointTurnCount)
}

function recordByTurnId(checkpoints: ReturnType<typeof retainedCheckpoints>) {
  return Object.fromEntries(
    checkpoints.map((checkpoint) => [checkpoint.turnId, checkpoint]),
  ) as OrchestrationProjectedThread['checkpointByTurnId']
}

function latestTurnAfterRevert(
  latestTurn: OrchestrationProjectedThread['latestTurn'],
  checkpoints: ReturnType<typeof retainedCheckpoints>,
  retainedTurnIds: Set<string>,
) {
  if (latestTurn && retainedTurnIds.has(latestTurn.turnId)) return latestTurn

  const checkpoint = checkpoints.at(-1)
  if (!checkpoint) return null

  return {
    assistantMessageId: checkpoint.assistantMessageId,
    completedAt: checkpoint.completedAt,
    requestedAt: checkpoint.completedAt,
    startedAt: checkpoint.completedAt,
    state: checkpoint.status === 'error' ? 'error' : 'completed',
    turnId: checkpoint.turnId,
  } satisfies NonNullable<OrchestrationProjectedThread['latestTurn']>
}

function shouldRetainAfterRevert(turnId: string | null, retainedTurnIds: Set<string>) {
  if (!turnId) return true

  return retainedTurnIds.has(turnId)
}

function updateProject(
  event: Extract<OrchestrationEvent, { type: 'project.meta-updated' }>,
  model: OrchestrationReadModel,
) {
  updateProjectValue(model, event.payload.projectId, {
    defaultModelSelection: event.payload.defaultModelSelection,
    scripts: event.payload.scripts,
    title: event.payload.title,
    updatedAt: event.payload.updatedAt,
    workspaceRoot: event.payload.workspaceRoot,
  })
}

function updateThreadMeta(
  event: Extract<OrchestrationEvent, { type: 'thread.meta-updated' }>,
  model: OrchestrationReadModel,
) {
  updateThreadValue(model, event.payload.threadId, {
    branch: event.payload.branch,
    modelSelection: event.payload.modelSelection,
    title: event.payload.title,
    updatedAt: event.payload.updatedAt,
    worktreePath: event.payload.worktreePath,
  })
}

function threadAfterActivity(
  thread: OrchestrationProjectedThread,
  event: Extract<OrchestrationEvent, { type: 'thread.activity-appended' }>,
) {
  upsertActivity(thread.activities, event)
  const counts = pendingRequestCountsAfterActivity(thread, event)

  return {
    ...thread,
    latestTurn: latestTurnAfterActivity(thread.latestTurn, event),
    pendingApprovalCount: counts.approvals,
    pendingUserInputCount: counts.userInputs,
    updatedAt: event.payload.activity.createdAt,
  }
}

/**
 * Only a request-relevant activity can move the counters, so the streaming
 * storm of tool-call activities never pays for the fold — the same gate the SQL
 * projection applies in `refreshPendingRequestCountsForActivity`.
 *
 * When it does fold, it folds the retained activities rather than incrementing:
 * a replayed batch or a revised activity can then never leave the counters
 * drifted from the request state they describe.
 */
function pendingRequestCountsAfterActivity(
  thread: OrchestrationProjectedThread,
  event: Extract<OrchestrationEvent, { type: 'thread.activity-appended' }>,
) {
  if (!isPendingRequestActivityKind(event.payload.activity.kind)) {
    return { approvals: thread.pendingApprovalCount, userInputs: thread.pendingUserInputCount }
  }

  return pendingRequestCounts(thread.activities)
}

function threadAfterSessionSet(
  thread: OrchestrationProjectedThread,
  session: OrchestrationSession,
) {
  const next = setThreadSession(thread, session)
  const settledState = settledTurnStateForSessionStatus(session.status)
  if (!settledState) return next

  return settleRunningTurn(next, settledState, session.updatedAt)
}

/**
 * A stop marks the session row stopped instead of dropping it: the SQL
 * projection keeps a stopped row and `hasActiveSession` reads the status, so
 * nulling the session here left the two read models answering differently.
 */
function threadAfterSessionStop(thread: OrchestrationProjectedThread, stoppedAt: string) {
  const stopped = thread.session
    ? setThreadSession(thread, { ...thread.session, status: 'stopped', updatedAt: stoppedAt })
    : thread

  return settleRunningTurn(stopped, 'interrupted', stoppedAt)
}

function upsertMessage(
  event: Extract<OrchestrationEvent, { type: 'thread.message-sent' }>,
  model: OrchestrationReadModel,
) {
  updateThread(model, event.payload.threadId, (thread) => {
    upsertThreadMessage(thread.messages, event)

    return {
      ...thread,
      latestUserMessageAt:
        event.payload.role === 'user' ? event.payload.createdAt : thread.latestUserMessageAt,
      latestTurn: latestTurnAfterMessage(thread.latestTurn, event),
      updatedAt: event.payload.updatedAt,
    }
  })
}

function upsertThreadMessage(
  messages: OrchestrationMessage[],
  event: Extract<OrchestrationEvent, { type: 'thread.message-sent' }>,
) {
  // Streaming deltas land on the newest message, so scan from the end.
  const index = messages.findLastIndex((message) => message.id === event.payload.messageId)
  if (index < 0) {
    appendBounded(messages, messageFromEvent(event), MAX_THREAD_MESSAGES)
    return
  }

  messages[index] = mergedMessage(messages[index]!, event)
}

function mergedMessage(
  message: OrchestrationMessage,
  event: Extract<OrchestrationEvent, { type: 'thread.message-sent' }>,
): OrchestrationMessage {
  return {
    ...message,
    // turnId and attachments are backfilled, never erased: a later frame that
    // carries neither (a bare completion) must keep what the first one bound.
    attachments:
      event.payload.attachments.length > 0 ? event.payload.attachments : message.attachments,
    streaming: event.payload.streaming,
    text: mergedMessageText(message.text, event.payload),
    turnId: event.payload.turnId ?? message.turnId,
    updatedAt: event.payload.updatedAt,
  }
}

/**
 * Mirrors the SQL projection's upsert: a re-emitted activity corrects the entry
 * it already has rather than being dropped. The two read models fold the same
 * events and must agree — while this returned early on a duplicate id, a
 * streaming activity that was later revised stayed frozen at its first frame in
 * memory while the persisted row moved on.
 *
 * Position and `sequence` are the original's: a content revision must not shove
 * the entry to the end of the thread, and `sequence` is what orders it.
 */
function upsertActivity(
  activities: OrchestrationProjectedThread['activities'],
  event: Extract<OrchestrationEvent, { type: 'thread.activity-appended' }>,
) {
  const index = activities.findLastIndex((activity) => activity.id === event.payload.activity.id)
  if (index < 0) {
    appendBounded(
      activities,
      { ...event.payload.activity, sequence: event.sequence },
      MAX_THREAD_ACTIVITIES,
    )
    return
  }

  const held = activities[index]!
  activities[index] = {
    ...event.payload.activity,
    // Identity and stream position stay the first frame's, exactly as the SQL
    // projection leaves them out of its SET: `createdAt` and `sequence` are what
    // order the thread, and a content revision must not restamp the entry to the
    // moment it was corrected.
    createdAt: held.createdAt,
    sequence: held.sequence,
    // Backfilled, never erased — the same rule the message upsert follows, so a
    // bare later frame cannot drop the entry out of its turn's fold.
    turnId: event.payload.activity.turnId ?? held.turnId,
  }
}

function messageFromEvent(event: Extract<OrchestrationEvent, { type: 'thread.message-sent' }>) {
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
  } satisfies OrchestrationMessage
}

function latestTurnAfterMessage(
  latestTurn: OrchestrationProjectedThread['latestTurn'],
  event: Extract<OrchestrationEvent, { type: 'thread.message-sent' }>,
) {
  if (event.payload.role !== 'assistant') return latestTurn
  if (!event.payload.turnId) return latestTurn
  if (latestTurn?.turnId && latestTurn.turnId !== event.payload.turnId) return latestTurn

  const base = latestTurn ?? {
    assistantMessageId: null,
    completedAt: null,
    requestedAt: event.payload.createdAt,
    startedAt: null,
    state: 'running' as const,
    turnId: event.payload.turnId,
  }

  return {
    ...base,
    assistantMessageId: event.payload.messageId,
    completedAt: event.payload.streaming
      ? base.completedAt
      : (base.completedAt ?? event.payload.updatedAt),
    startedAt: base.startedAt ?? event.payload.createdAt,
    state: assistantMessageTurnState(base.state, event.payload.streaming),
  }
}

function assistantMessageTurnState(current: LatestTurnState, streaming: boolean) {
  if (streaming) return current
  if (current === 'interrupted' || current === 'error') return current

  return 'completed'
}

function latestTurnAfterActivity(
  latestTurn: OrchestrationProjectedThread['latestTurn'],
  event: Extract<OrchestrationEvent, { type: 'thread.activity-appended' }>,
) {
  if (!isProviderTurnFailureActivity(event.payload.activity.kind)) return latestTurn
  if (!latestTurn) return latestTurn
  if (event.payload.activity.turnId !== latestTurn.turnId) return latestTurn

  return {
    ...latestTurn,
    completedAt: event.payload.activity.createdAt,
    state: 'error' as const,
  }
}

function isProviderTurnFailureActivity(kind: string) {
  return kind === 'provider.turn.start.failed' || kind === 'provider.turn.failed'
}

function updateProjectValue(
  model: OrchestrationReadModel,
  projectId: string,
  patch: Partial<
    OrchestrationReadModel['projects'] extends Map<string, infer Project> ? Project : never
  >,
) {
  const project = model.projects.get(projectId)
  if (!project) return

  model.projects.set(projectId, compactUpdate(project, patch))
}

function updateThreadValue(
  model: OrchestrationReadModel,
  threadId: string,
  patch: Partial<OrchestrationProjectedThread>,
) {
  updateThread(model, threadId, (thread) => compactUpdate(thread, patch))
}

function updateThread(
  model: OrchestrationReadModel,
  threadId: string,
  update: (thread: OrchestrationProjectedThread) => OrchestrationProjectedThread,
) {
  const thread = model.threads.get(threadId)
  if (!thread) return

  model.threads.set(threadId, update(thread))
}

function compactUpdate<T extends object>(value: T, patch: Partial<T>) {
  const next = { ...value }

  for (const [key, candidate] of Object.entries(patch)) {
    if (candidate === undefined) continue
    Object.assign(next, { [key]: candidate })
  }

  return next
}
