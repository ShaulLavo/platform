import {
  DEFAULT_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  eventIdSchema,
  type OrchestrationCommand,
} from './schemas'
import * as v from 'valibot'
import { approvalRequestIdSchema } from '@workspace/contracts'
import type { EventId, OrchestrationEventMetadata, ProjectId, ThreadId } from '@workspace/contracts'
import { orchestrationErrors } from '../observability'
import { activityRequestId } from './pending-requests'
import {
  liveProjectThreads,
  requireActiveProjectWorkspaceRootAbsent,
  requireExpectedBranch,
  requireFutureWakeTime,
  requirePinned,
  requireProject,
  requireProjectAbsent,
  requireSettleable,
  requireSnoozable,
  requireThreadAbsent,
  requireThreadArchived,
  requireActionableSourcePlan,
  requireThreadNotArchived,
  requireThreadNotDeleted,
  requireValidOrderKey,
} from './command-invariants'
import type { PendingOrchestrationEvent } from './event-store'
import type { OrchestrationProjectedThread, OrchestrationReadModel } from './read-model'

/**
 * One server clock reading per command. It stamps every event's `occurredAt`
 * and every projected timestamp, so a batch (a cascade, a turn start) lands as
 * one instant and a client can never place an event in the past or the future.
 */
export function decideOrchestrationCommand(
  command: OrchestrationCommand,
  model: OrchestrationReadModel,
) {
  const at = new Date().toISOString()

  switch (command.type) {
    case 'project.create':
      return projectCreated(command, model, at)
    case 'project.meta.update':
      return projectMetaUpdated(command, model, at)
    case 'project.reorder':
      return projectReordered(command, model, at)
    case 'project.delete':
      return projectDeleted(command, model, at)
    case 'thread.create':
      return threadCreated(command, model, at)
    case 'thread.meta.update':
      return threadMetaUpdated(command, model, at)
    case 'thread.delete':
      requireThreadNotDeleted(model, command.threadId)

      return one(command, at, 'thread.deleted', {
        deletedAt: at,
        threadId: command.threadId,
      })
    case 'thread.archive':
      requireThreadNotArchived(model, command.threadId, command.type)

      return one(command, at, 'thread.archived', {
        archivedAt: at,
        threadId: command.threadId,
        updatedAt: at,
      })
    case 'thread.unarchive':
      requireThreadArchived(model, command.threadId)

      return one(command, at, 'thread.unarchived', {
        threadId: command.threadId,
        updatedAt: at,
      })
    case 'thread.settle':
      return threadSettled(command, model, at)
    case 'thread.unsettle':
      return threadUnsettled(command, model, at)
    case 'thread.snooze':
      return threadSnoozed(command, model, at)
    case 'thread.unsnooze':
      return threadUnsnoozed(command, model, at)
    case 'thread.pin':
      return threadPinned(command, model, at)
    case 'thread.unpin':
      return threadUnpinned(command, model, at)
    case 'thread.pin.reorder':
      return threadPinReordered(command, model, at)
    case 'thread.runtime-mode.set':
      requireThreadNotArchived(model, command.threadId, command.type)

      return one(command, at, 'thread.runtime-mode-set', {
        runtimeMode: command.runtimeMode,
        threadId: command.threadId,
        updatedAt: at,
      })
    case 'thread.interaction-mode.set':
      requireThreadNotArchived(model, command.threadId, command.type)

      return one(command, at, 'thread.interaction-mode-set', {
        interactionMode: command.interactionMode,
        threadId: command.threadId,
        updatedAt: at,
      })
    case 'thread.turn.start':
      return turnStartRequested(command, model, at)
    case 'thread.turn.interrupt':
      requireThreadNotDeleted(model, command.threadId)

      return one(command, at, 'thread.turn-interrupt-requested', {
        createdAt: at,
        threadId: command.threadId,
        turnId: command.turnId,
      })
    case 'thread.session.stop':
      requireThreadNotDeleted(model, command.threadId)

      return one(command, at, 'thread.session-stop-requested', {
        createdAt: at,
        threadId: command.threadId,
      })
    case 'thread.approval.respond':
      requireThreadNotDeleted(model, command.threadId)

      return one(
        command,
        at,
        'thread.approval-response-requested',
        {
          createdAt: at,
          decision: command.decision,
          requestId: command.requestId,
          threadId: command.threadId,
        },
        // The envelope carries the requestId too, so a log scan can correlate
        // the response with the request without unpacking the payload.
        { metadata: { requestId: command.requestId } },
      )
    case 'thread.user-input.respond':
      requireThreadNotDeleted(model, command.threadId)

      return one(
        command,
        at,
        'thread.user-input-response-requested',
        {
          answers: command.answers,
          createdAt: at,
          requestId: command.requestId,
          threadId: command.threadId,
        },
        { metadata: { requestId: command.requestId } },
      )
    case 'thread.checkpoint.revert':
      requireThreadNotArchived(model, command.threadId, command.type)

      return one(command, at, 'thread.checkpoint-revert-requested', {
        createdAt: at,
        threadId: command.threadId,
        turnCount: command.turnCount,
      })
    case 'thread.session.set':
      return sessionSet(command, model, at)
    case 'thread.message.assistant.delta':
      requireThreadNotDeleted(model, command.threadId)

      return one(command, at, 'thread.message-sent', {
        attachments: [],
        createdAt: command.createdAt,
        messageId: command.messageId,
        role: 'assistant',
        streaming: true,
        text: command.delta,
        threadId: command.threadId,
        turnId: command.turnId ?? null,
        updatedAt: command.createdAt,
      })
    case 'thread.message.assistant.complete':
      requireThreadNotDeleted(model, command.threadId)

      return one(command, at, 'thread.message-sent', {
        attachments: [],
        createdAt: command.completedAt,
        messageId: command.messageId,
        role: 'assistant',
        streaming: false,
        text: '',
        threadId: command.threadId,
        turnId: command.turnId ?? null,
        updatedAt: command.completedAt,
      })
    case 'thread.activity.append':
      return activityAppended(command, model, at)
    case 'thread.proposed-plan.upsert':
      requireThreadNotDeleted(model, command.threadId)

      return one(command, at, 'thread.proposed-plan-upserted', {
        proposedPlan: command.proposedPlan,
        threadId: command.threadId,
      })
    case 'thread.turn.diff.complete':
      requireThreadNotDeleted(model, command.threadId)

      return one(command, at, 'thread.turn-diff-completed', {
        assistantMessageId: command.assistantMessageId ?? null,
        checkpointRef: command.checkpointRef,
        checkpointTurnCount: command.checkpointTurnCount,
        completedAt: command.completedAt,
        files: command.files,
        status: command.status,
        threadId: command.threadId,
        turnId: command.turnId,
      })
    case 'thread.revert.complete':
      requireThreadNotDeleted(model, command.threadId)

      return one(command, at, 'thread.reverted', {
        revertedAt: command.createdAt,
        threadId: command.threadId,
        turnCount: command.turnCount,
      })
  }
}

function projectCreated(
  command: Extract<OrchestrationCommand, { type: 'project.create' }>,
  model: OrchestrationReadModel,
  at: string,
) {
  requireProjectAbsent(model, command.projectId)
  requireActiveProjectWorkspaceRootAbsent(model, command.workspaceRoot, command.projectId)

  return one(command, at, 'project.created', {
    createdAt: at,
    defaultModelSelection: command.defaultModelSelection,
    projectId: command.projectId,
    title: command.title,
    updatedAt: at,
    workspaceRoot: command.workspaceRoot,
  })
}

function projectMetaUpdated(
  command: Extract<OrchestrationCommand, { type: 'project.meta.update' }>,
  model: OrchestrationReadModel,
  at: string,
) {
  requireProject(model, command.projectId)
  if (command.workspaceRoot !== undefined) {
    requireActiveProjectWorkspaceRootAbsent(model, command.workspaceRoot, command.projectId)
  }

  return one(command, at, 'project.meta-updated', {
    defaultModelSelection: command.defaultModelSelection,
    projectId: command.projectId,
    scripts: command.scripts,
    title: command.title,
    updatedAt: at,
    workspaceRoot: command.workspaceRoot,
  })
}

/**
 * A drag writes exactly one key to exactly one project: the client mints a
 * fractional key that sorts between the drop position's neighbours, and the
 * neighbours are never touched. A reorder that raced a delete is refused rather
 * than resurrecting the row as an orphaned key.
 */
function projectReordered(
  command: Extract<OrchestrationCommand, { type: 'project.reorder' }>,
  model: OrchestrationReadModel,
  at: string,
) {
  requireProject(model, command.projectId)
  requireValidOrderKey(command.orderKey)

  return one(command, at, 'project.reordered', {
    orderKey: command.orderKey,
    projectId: command.projectId,
  })
}

/**
 * Deleting a project is a cascade, not a flag flip: every thread it owns keeps
 * a live provider session and keeps showing up in thread queries until it is
 * tombstoned too. The threads are deleted in the same batch as the project so
 * the whole cascade commits or rolls back as one transaction.
 */
function projectDeleted(
  command: Extract<OrchestrationCommand, { type: 'project.delete' }>,
  model: OrchestrationReadModel,
  at: string,
) {
  requireProject(model, command.projectId)
  const threads = liveProjectThreads(model, command.projectId)
  if (threads.length > 0 && !command.force) {
    throw orchestrationErrors.PROJECT_NOT_EMPTY({
      projectId: command.projectId,
      threadCount: threads.length,
    })
  }

  const cascade = threads.map((thread) =>
    event(command, at, 'thread.deleted', {
      deletedAt: at,
      threadId: thread.id,
    }),
  )

  return [
    ...cascade,
    event(command, at, 'project.deleted', {
      deletedAt: at,
      projectId: command.projectId,
    }),
  ]
}

function threadCreated(
  command: Extract<OrchestrationCommand, { type: 'thread.create' }>,
  model: OrchestrationReadModel,
  at: string,
) {
  requireProject(model, command.projectId)
  requireThreadAbsent(model, command.threadId)

  return one(command, at, 'thread.created', {
    branch: command.branch,
    createdAt: at,
    interactionMode: command.interactionMode ?? DEFAULT_INTERACTION_MODE,
    modelSelection: command.modelSelection,
    projectId: command.projectId,
    runtimeMode: command.runtimeMode ?? DEFAULT_RUNTIME_MODE,
    threadId: command.threadId,
    title: command.title,
    updatedAt: at,
    worktreePath: command.worktreePath,
  })
}

function threadMetaUpdated(
  command: Extract<OrchestrationCommand, { type: 'thread.meta.update' }>,
  model: OrchestrationReadModel,
  at: string,
) {
  const thread = requireThreadNotDeleted(model, command.threadId)
  requireExpectedBranch(thread, command.expectedBranch)

  return one(command, at, 'thread.meta-updated', {
    branch: command.branch,
    modelSelection: command.modelSelection,
    threadId: command.threadId,
    title: command.title,
    updatedAt: at,
    worktreePath: command.worktreePath,
  })
}

/**
 * Settling is idempotent by re-emission rather than by returning nothing: the
 * engine rejects a zero-event command, and a bulk settle or a double click has
 * to stay a silent no-op instead of surfacing an error. Re-emitting the
 * original `settledAt` *and* `updatedAt` is what makes the duplicate project as
 * a no-op — a fresh timestamp would churn every ordering that reads updatedAt.
 */
function threadSettled(
  command: Extract<OrchestrationCommand, { type: 'thread.settle' }>,
  model: OrchestrationReadModel,
  at: string,
) {
  const thread = requireThreadNotArchived(model, command.threadId, command.type)
  requireSettleable(thread, command.type, at)

  const settledAt = thread.settledOverride === 'settled' ? thread.settledAt : null
  const settled = event(command, at, 'thread.settled', {
    settledAt: settledAt ?? at,
    threadId: command.threadId,
    updatedAt: settledAt ? thread.updatedAt : at,
  })
  // Settling is "I am done with this", so it clears a pin the same way it parks
  // the thread. Without this the pin would hold the card in place and the
  // settle would only stamp invisible state.
  if (!thread.pinnedAt) return [settled]

  return [
    settled,
    event(command, at, 'thread.unpinned', { threadId: command.threadId, updatedAt: at }),
  ]
}

function threadUnsettled(
  command: Extract<OrchestrationCommand, { type: 'thread.unsettle' }>,
  model: OrchestrationReadModel,
  at: string,
) {
  const thread = requireThreadNotArchived(model, command.threadId, command.type)
  const alreadyActive = thread.settledOverride === 'active'

  return one(command, at, 'thread.unsettled', {
    reason: command.reason,
    threadId: command.threadId,
    updatedAt: alreadyActive ? thread.updatedAt : at,
  })
}

function threadSnoozed(
  command: Extract<OrchestrationCommand, { type: 'thread.snooze' }>,
  model: OrchestrationReadModel,
  at: string,
) {
  const thread = requireThreadNotArchived(model, command.threadId, command.type)
  requireFutureWakeTime(command.threadId, command.snoozedUntil, at)
  requireSnoozable(thread, command.type, at)

  // Re-snoozing to the SAME wake time is a duplicate (double click, raced
  // clients) and re-emits the original timestamps so it projects as a no-op. A
  // different wake time is a real change and stamps fresh.
  const snoozedAt = thread.snoozedUntil === command.snoozedUntil ? thread.snoozedAt : null

  return one(command, at, 'thread.snoozed', {
    snoozedAt: snoozedAt ?? at,
    snoozedUntil: command.snoozedUntil,
    threadId: command.threadId,
    updatedAt: snoozedAt ? thread.updatedAt : at,
  })
}

function threadUnsnoozed(
  command: Extract<OrchestrationCommand, { type: 'thread.unsnooze' }>,
  model: OrchestrationReadModel,
  at: string,
) {
  const thread = requireThreadNotArchived(model, command.threadId, command.type)
  const alreadyAwake = thread.snoozedUntil == null

  return one(command, at, 'thread.unsnoozed', {
    reason: command.reason,
    threadId: command.threadId,
    updatedAt: alreadyAwake ? thread.updatedAt : at,
  })
}

/**
 * Pinning carries no lifecycle invariant — a pin only ever promotes a thread,
 * so it can never hide pending work — but it is a promotion rather than an
 * override: it spends the settle and the snooze instead of silently outranking
 * them. The thread is on top now, not on Tuesday.
 */
function threadPinned(
  command: Extract<OrchestrationCommand, { type: 'thread.pin' }>,
  model: OrchestrationReadModel,
  at: string,
) {
  const thread = requireThreadNotArchived(model, command.threadId, command.type)
  const pinnedAt = thread.pinnedAt ?? null
  const pinned = event(command, at, 'thread.pinned', {
    pinnedAt: pinnedAt ?? at,
    // A fresh pin takes the client's slot; on a re-pin the existing key wins so
    // a raced duplicate cannot move a thread the user already placed.
    ...(pinnedAt || command.orderKey === undefined ? {} : { pinOrderKey: command.orderKey }),
    threadId: command.threadId,
    updatedAt: pinnedAt ? thread.updatedAt : at,
  })

  return [pinned, ...promotionEvents(command, thread, at)]
}

function promotionEvents(
  command: Extract<OrchestrationCommand, { type: 'thread.pin' }>,
  thread: OrchestrationProjectedThread,
  at: string,
) {
  const events: PendingOrchestrationEvent[] = []
  if (thread.settledOverride === 'settled') {
    events.push(
      event(command, at, 'thread.unsettled', {
        reason: 'user',
        threadId: command.threadId,
        updatedAt: at,
      }),
    )
  }
  if (thread.snoozedUntil != null) {
    events.push(
      event(command, at, 'thread.unsnoozed', {
        reason: 'user',
        threadId: command.threadId,
        updatedAt: at,
      }),
    )
  }

  return events
}

function threadUnpinned(
  command: Extract<OrchestrationCommand, { type: 'thread.unpin' }>,
  model: OrchestrationReadModel,
  at: string,
) {
  const thread = requireThreadNotArchived(model, command.threadId, command.type)
  const alreadyUnpinned = thread.pinnedAt == null

  return one(command, at, 'thread.unpinned', {
    threadId: command.threadId,
    updatedAt: alreadyUnpinned ? thread.updatedAt : at,
  })
}

/**
 * A drag writes exactly one key to exactly one row: the client computes a
 * fractional key that sorts between the drop position's neighbours, and the
 * neighbours are never touched. Refusing an unpinned thread (rather than
 * silently pinning it) keeps a reorder that raced an unpin from resurrecting
 * the pin the user just cleared.
 */
function threadPinReordered(
  command: Extract<OrchestrationCommand, { type: 'thread.pin.reorder' }>,
  model: OrchestrationReadModel,
  at: string,
) {
  const thread = requireThreadNotArchived(model, command.threadId, command.type)
  requirePinned(thread)
  const unchanged = thread.pinOrderKey === command.orderKey

  return one(command, at, 'thread.pin-reordered', {
    orderKey: command.orderKey,
    threadId: command.threadId,
    updatedAt: unchanged ? thread.updatedAt : at,
  })
}

/**
 * Only a session coming alive counts as activity worth waking a settled thread
 * for: ready/stopped/error writes arrive after the fact and must not fight a
 * user's explicit settle. Snooze is deliberately NOT cleared here — snooze
 * never pauses the agent, so its session starting is not the user re-engaging.
 */
function sessionSet(
  command: Extract<OrchestrationCommand, { type: 'thread.session.set' }>,
  model: OrchestrationReadModel,
  at: string,
) {
  const thread = requireThreadNotDeleted(model, command.threadId)
  const sessionSetEvent = event(command, at, 'thread.session-set', {
    session: command.session,
    threadId: command.threadId,
  })
  const alive = command.session.status === 'starting' || command.session.status === 'running'
  if (!alive || thread.settledOverride == null) return [sessionSetEvent]

  return [autoUnsettled(command, at, command.threadId, command.createdAt), sessionSetEvent]
}

/**
 * An approval or user-input request is blocked-on-you work: it must never stay
 * hidden inside a settled row.
 */
function activityAppended(
  command: Extract<OrchestrationCommand, { type: 'thread.activity.append' }>,
  model: OrchestrationReadModel,
  at: string,
) {
  const thread = requireThreadNotDeleted(model, command.threadId)
  const appended = event(
    command,
    at,
    'thread.activity-appended',
    {
      activity: command.activity,
      threadId: command.threadId,
    },
    { metadata: activityEnvelopeMetadata(command.activity) },
  )
  const wakes =
    command.activity.kind === 'approval.requested' ||
    command.activity.kind === 'user-input.requested'
  if (!wakes || thread.settledOverride == null) return [appended]

  return [autoUnsettled(command, at, command.threadId, command.createdAt), appended]
}

/**
 * Lifts the request an approval/user-input activity addresses into the event
 * envelope, so the log correlates request and response without payload
 * unpacking. Non-request activities keep an empty metadata object.
 */
function activityEnvelopeMetadata(
  activity: Extract<OrchestrationCommand, { type: 'thread.activity.append' }>['activity'],
): OrchestrationEventMetadata {
  const requestId = activityRequestId(activity.payload)
  if (requestId === null) return {}

  return { requestId: v.parse(approvalRequestIdSchema, requestId) }
}

/**
 * Real activity resets ANY override: it wakes an explicitly settled thread and
 * it clears a keep-active override back to neutral, so the thread can settle on
 * its own again once this burst of work goes stale.
 */
function autoUnsettled(
  command: OrchestrationCommand,
  at: string,
  threadId: ThreadId,
  updatedAt: string,
) {
  return event(command, at, 'thread.unsettled', {
    reason: 'activity',
    threadId,
    updatedAt,
  })
}

function turnStartRequested(
  command: Extract<OrchestrationCommand, { type: 'thread.turn.start' }>,
  model: OrchestrationReadModel,
  at: string,
) {
  const bootstrapEvent = bootstrapThreadCreated(command, model, at)
  if (!bootstrapEvent) requireThreadNotArchived(model, command.threadId, command.type)
  // Checked before any event is planned: the projector clears the cited
  // thread's actionable-plan flag unconditionally, so an unvalidated reference
  // is a write to a thread this turn has nothing to do with.
  requireActionableSourcePlan(model, command.sourceProposedPlan)

  const messageEvent = event(command, at, 'thread.message-sent', {
    attachments: command.message.attachments,
    createdAt: at,
    messageId: command.message.messageId,
    role: command.message.role,
    streaming: false,
    text: command.message.text,
    threadId: command.threadId,
    turnId: command.turnId,
    updatedAt: at,
  })
  const turnEvents = [
    ...lifecycleResetEvents(command, model.threads.get(command.threadId), at),
    messageEvent,
    // The turn exists because the message asked for it; without the link the
    // message→turn causal chain is unreconstructible from the log.
    event(
      command,
      at,
      'thread.turn-start-requested',
      {
        createdAt: at,
        interactionMode: command.interactionMode,
        messageId: command.message.messageId,
        modelSelection: command.modelSelection,
        runtimeMode: command.runtimeMode,
        sourceProposedPlan: command.sourceProposedPlan,
        threadId: command.threadId,
        titleSeed: command.titleSeed,
        turnId: command.turnId,
      },
      { causationEventId: messageEvent.eventId },
    ),
  ]

  return bootstrapEvent ? [bootstrapEvent, ...turnEvents] : turnEvents
}

/**
 * Sending is the loudest activity there is, so a turn start spends every parked
 * state before the message lands: an explicit settle wakes, a keep-active
 * override drops back to neutral, and the snooze's return ticket is spent —
 * the user is re-engaging now, not on Tuesday. A bootstrapped thread has no
 * prior state to reset.
 */
function lifecycleResetEvents(
  command: Extract<OrchestrationCommand, { type: 'thread.turn.start' }>,
  thread: OrchestrationProjectedThread | undefined,
  at: string,
) {
  if (!thread) return []

  const events: PendingOrchestrationEvent[] = []
  if (thread.settledOverride != null) {
    events.push(autoUnsettled(command, at, command.threadId, at))
  }
  if (thread.snoozedUntil != null) {
    events.push(
      event(command, at, 'thread.unsnoozed', {
        reason: 'activity',
        threadId: command.threadId,
        updatedAt: at,
      }),
    )
  }

  return events
}

function bootstrapThreadCreated(
  command: Extract<OrchestrationCommand, { type: 'thread.turn.start' }>,
  model: OrchestrationReadModel,
  at: string,
) {
  const createThread = command.bootstrap?.createThread
  if (!createThread) return null

  requireProject(model, createThread.projectId)
  requireThreadAbsent(model, command.threadId)

  return event(command, at, 'thread.created', {
    branch: createThread.branch,
    createdAt: at,
    interactionMode: createThread.interactionMode ?? DEFAULT_INTERACTION_MODE,
    modelSelection: createThread.modelSelection,
    projectId: createThread.projectId,
    runtimeMode: createThread.runtimeMode ?? DEFAULT_RUNTIME_MODE,
    threadId: command.threadId,
    title: createThread.title,
    updatedAt: at,
    worktreePath: createThread.worktreePath,
  })
}

type EventPayload = Record<string, unknown> & ({ projectId: ProjectId } | { threadId: ThreadId })

function one<Type extends PendingOrchestrationEvent['type']>(
  command: OrchestrationCommand,
  at: string,
  type: Type,
  payload: EventPayload,
  options?: EventEnvelopeOptions,
) {
  return [event(command, at, type, payload, options)]
}

type EventEnvelopeOptions = {
  readonly causationEventId?: EventId
  readonly metadata?: OrchestrationEventMetadata
}

function event<Type extends PendingOrchestrationEvent['type']>(
  command: OrchestrationCommand,
  at: string,
  type: Type,
  payload: EventPayload,
  options?: EventEnvelopeOptions,
) {
  const pending: unknown = {
    actorKind:
      command.type.startsWith('thread.message.') || command.type === 'thread.session.set'
        ? 'provider'
        : 'client',
    ...aggregate(payload),
    causationEventId: options?.causationEventId ?? null,
    commandId: command.commandId,
    correlationId: command.commandId,
    eventId: v.parse(eventIdSchema, `event-${crypto.randomUUID()}`),
    metadata: options?.metadata ?? {},
    occurredAt: at,
    payload,
    type,
  }

  return pending as PendingOrchestrationEvent
}

/**
 * The aggregate follows the payload, not the command: the cascade under
 * `project.delete` plans thread events from a project command.
 */
function aggregate(payload: EventPayload) {
  if ('threadId' in payload) {
    return { aggregateId: payload.threadId, aggregateKind: 'thread' } as const
  }

  return { aggregateId: payload.projectId, aggregateKind: 'project' } as const
}
