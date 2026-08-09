import {
  DEFAULT_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  eventIdSchema,
  type OrchestrationCommand,
} from './schemas'
import * as v from 'valibot'
import type { ProjectId, ThreadId } from '@workspace/contracts'
import { orchestrationErrors } from '../observability'
import {
  liveProjectThreads,
  requireActiveProjectWorkspaceRootAbsent,
  requireExpectedBranch,
  requireProject,
  requireProjectAbsent,
  requireThreadAbsent,
  requireThreadArchived,
  requireThreadNotArchived,
  requireThreadNotDeleted,
} from './command-invariants'
import type { PendingOrchestrationEvent } from './event-store'
import type { OrchestrationReadModel } from './read-model'

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

      return one(command, at, 'thread.approval-response-requested', {
        createdAt: at,
        decision: command.decision,
        requestId: command.requestId,
        threadId: command.threadId,
      })
    case 'thread.user-input.respond':
      requireThreadNotDeleted(model, command.threadId)

      return one(command, at, 'thread.user-input-response-requested', {
        answers: command.answers,
        createdAt: at,
        requestId: command.requestId,
        threadId: command.threadId,
      })
    case 'thread.checkpoint.revert':
      requireThreadNotArchived(model, command.threadId, command.type)

      return one(command, at, 'thread.checkpoint-revert-requested', {
        createdAt: at,
        threadId: command.threadId,
        turnCount: command.turnCount,
      })
    case 'thread.session.set':
      requireThreadNotDeleted(model, command.threadId)

      return one(command, at, 'thread.session-set', {
        session: command.session,
        threadId: command.threadId,
      })
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
      requireThreadNotDeleted(model, command.threadId)

      return one(command, at, 'thread.activity-appended', {
        activity: command.activity,
        threadId: command.threadId,
      })
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
    title: command.title,
    updatedAt: at,
    workspaceRoot: command.workspaceRoot,
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

function turnStartRequested(
  command: Extract<OrchestrationCommand, { type: 'thread.turn.start' }>,
  model: OrchestrationReadModel,
  at: string,
) {
  const bootstrapEvent = bootstrapThreadCreated(command, model, at)
  if (!bootstrapEvent) requireThreadNotArchived(model, command.threadId, command.type)

  const turnEvents = [
    event(command, at, 'thread.message-sent', {
      attachments: command.message.attachments,
      createdAt: at,
      messageId: command.message.messageId,
      role: command.message.role,
      streaming: false,
      text: command.message.text,
      threadId: command.threadId,
      turnId: command.turnId,
      updatedAt: at,
    }),
    event(command, at, 'thread.turn-start-requested', {
      createdAt: at,
      interactionMode: command.interactionMode,
      messageId: command.message.messageId,
      modelSelection: command.modelSelection,
      runtimeMode: command.runtimeMode,
      sourceProposedPlan: command.sourceProposedPlan,
      threadId: command.threadId,
      titleSeed: command.titleSeed,
      turnId: command.turnId,
    }),
  ]

  return bootstrapEvent ? [bootstrapEvent, ...turnEvents] : turnEvents
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
) {
  return [event(command, at, type, payload)]
}

function event<Type extends PendingOrchestrationEvent['type']>(
  command: OrchestrationCommand,
  at: string,
  type: Type,
  payload: EventPayload,
) {
  const pending: unknown = {
    actorKind:
      command.type.startsWith('thread.message.') || command.type === 'thread.session.set'
        ? 'provider'
        : 'client',
    ...aggregate(payload),
    causationEventId: null,
    commandId: command.commandId,
    correlationId: command.commandId,
    eventId: v.parse(eventIdSchema, `event-${crypto.randomUUID()}`),
    metadata: {},
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
