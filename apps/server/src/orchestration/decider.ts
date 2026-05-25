import {
  DEFAULT_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  eventIdSchema,
  type OrchestrationCommand,
} from './schemas'
import * as v from 'valibot'
import { orchestrationErrors } from '../observability'
import type { PendingOrchestrationEvent } from './event-store'
import { requireProject, requireThread, type OrchestrationReadModel } from './read-model'

export function decideOrchestrationCommand(
  command: OrchestrationCommand,
  model: OrchestrationReadModel,
) {
  switch (command.type) {
    case 'project.create':
      return projectCreated(command, model)
    case 'project.meta.update':
      return one(command, 'project.meta-updated', {
        defaultModelSelection: command.defaultModelSelection,
        projectId: command.projectId,
        title: command.title,
        updatedAt: command.updatedAt,
        workspaceRoot: command.workspaceRoot,
      })
    case 'project.delete':
      return one(command, 'project.deleted', {
        deletedAt: command.deletedAt,
        projectId: command.projectId,
      })
    case 'thread.create':
      return threadCreated(command, model)
    case 'thread.meta.update':
      return one(command, 'thread.meta-updated', {
        branch: command.branch,
        modelSelection: command.modelSelection,
        threadId: command.threadId,
        title: command.title,
        updatedAt: command.updatedAt,
        worktreePath: command.worktreePath,
      })
    case 'thread.delete':
      return one(command, 'thread.deleted', {
        deletedAt: command.deletedAt,
        threadId: command.threadId,
      })
    case 'thread.archive':
      return one(command, 'thread.archived', {
        archivedAt: command.archivedAt,
        threadId: command.threadId,
        updatedAt: command.archivedAt,
      })
    case 'thread.unarchive':
      return one(command, 'thread.unarchived', {
        threadId: command.threadId,
        updatedAt: command.updatedAt,
      })
    case 'thread.runtime-mode.set':
      return one(command, 'thread.runtime-mode-set', {
        runtimeMode: command.runtimeMode,
        threadId: command.threadId,
        updatedAt: command.updatedAt,
      })
    case 'thread.interaction-mode.set':
      return one(command, 'thread.interaction-mode-set', {
        interactionMode: command.interactionMode,
        threadId: command.threadId,
        updatedAt: command.updatedAt,
      })
    case 'thread.turn.start':
      return turnStartRequested(command, model)
    case 'thread.turn.interrupt':
      return one(command, 'thread.turn-interrupt-requested', {
        createdAt: command.createdAt,
        threadId: command.threadId,
        turnId: command.turnId,
      })
    case 'thread.session.stop':
      return one(command, 'thread.session-stop-requested', {
        createdAt: command.createdAt,
        threadId: command.threadId,
      })
    case 'thread.approval.respond':
      return one(command, 'thread.approval-response-requested', {
        createdAt: command.createdAt,
        decision: command.decision,
        requestId: command.requestId,
        threadId: command.threadId,
      })
    case 'thread.user-input.respond':
      return one(command, 'thread.user-input-response-requested', {
        answers: command.answers,
        createdAt: command.createdAt,
        requestId: command.requestId,
        threadId: command.threadId,
      })
    case 'thread.session.set':
      return one(command, 'thread.session-set', {
        session: command.session,
        threadId: command.threadId,
      })
    case 'thread.message.assistant.delta':
      return one(command, 'thread.message-sent', {
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
      return one(command, 'thread.message-sent', {
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
      return one(command, 'thread.activity-appended', {
        activity: command.activity,
        threadId: command.threadId,
      })
    case 'thread.proposed-plan.upsert':
      return one(command, 'thread.proposed-plan-upserted', {
        proposedPlan: command.proposedPlan,
        threadId: command.threadId,
      })
    case 'thread.turn.diff.complete':
      return one(command, 'thread.turn-diff-completed', {
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
      return one(command, 'thread.reverted', {
        revertedAt: command.createdAt,
        threadId: command.threadId,
        turnCount: command.turnCount,
      })
  }
}

function projectCreated(
  command: Extract<OrchestrationCommand, { type: 'project.create' }>,
  model: OrchestrationReadModel,
) {
  if (model.projects.has(command.projectId))
    throw orchestrationErrors.PROJECT_ALREADY_EXISTS({ projectId: command.projectId })

  return one(command, 'project.created', {
    createdAt: command.createdAt,
    defaultModelSelection: command.defaultModelSelection,
    projectId: command.projectId,
    title: command.title,
    updatedAt: command.createdAt,
    workspaceRoot: command.workspaceRoot,
  })
}

function threadCreated(
  command: Extract<OrchestrationCommand, { type: 'thread.create' }>,
  model: OrchestrationReadModel,
) {
  requireProject(model, command.projectId)
  if (model.threads.has(command.threadId))
    throw orchestrationErrors.THREAD_ALREADY_EXISTS({ threadId: command.threadId })

  return one(command, 'thread.created', {
    branch: command.branch,
    createdAt: command.createdAt,
    interactionMode: command.interactionMode ?? DEFAULT_INTERACTION_MODE,
    modelSelection: command.modelSelection,
    projectId: command.projectId,
    runtimeMode: command.runtimeMode ?? DEFAULT_RUNTIME_MODE,
    threadId: command.threadId,
    title: command.title,
    updatedAt: command.createdAt,
    worktreePath: command.worktreePath,
  })
}

function turnStartRequested(
  command: Extract<OrchestrationCommand, { type: 'thread.turn.start' }>,
  model: OrchestrationReadModel,
) {
  requireThread(model, command.threadId)

  return [
    event(command, 'thread.message-sent', {
      attachments: command.message.attachments,
      createdAt: command.createdAt,
      messageId: command.message.messageId,
      role: command.message.role,
      streaming: false,
      text: command.message.text,
      threadId: command.threadId,
      turnId: command.turnId,
      updatedAt: command.createdAt,
    }),
    event(command, 'thread.turn-start-requested', {
      createdAt: command.createdAt,
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
}

function one<Type extends PendingOrchestrationEvent['type']>(
  command: OrchestrationCommand,
  type: Type,
  payload: unknown,
) {
  return [event(command, type, payload)]
}

function event<Type extends PendingOrchestrationEvent['type']>(
  command: OrchestrationCommand,
  type: Type,
  payload: unknown,
) {
  const pending = {
    actorKind:
      command.type.startsWith('thread.message.') || command.type === 'thread.session.set'
        ? 'provider'
        : 'client',
    aggregateId: aggregateId(command),
    aggregateKind: command.type.startsWith('project.') ? 'project' : 'thread',
    causationEventId: null,
    commandId: command.commandId,
    correlationId: command.commandId,
    eventId: v.parse(eventIdSchema, `event-${crypto.randomUUID()}`),
    metadata: {},
    occurredAt: eventTimestamp(command),
    payload,
    type,
  }

  return pending as PendingOrchestrationEvent
}

function aggregateId(command: OrchestrationCommand) {
  if (isProjectCommand(command)) return command.projectId

  return command.threadId
}

function isProjectCommand(
  command: OrchestrationCommand,
): command is Extract<
  OrchestrationCommand,
  { type: 'project.create' | 'project.meta.update' | 'project.delete' }
> {
  return command.type.startsWith('project.')
}

function eventTimestamp(command: OrchestrationCommand) {
  if ('createdAt' in command) return command.createdAt
  if ('updatedAt' in command) return command.updatedAt
  if ('deletedAt' in command) return command.deletedAt
  if ('archivedAt' in command) return command.archivedAt
  if ('completedAt' in command) return command.completedAt

  return new Date().toISOString()
}
