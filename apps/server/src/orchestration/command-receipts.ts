import { eq } from 'drizzle-orm'
import * as v from 'valibot'
import type {
  OrchestrationCommand,
  OrchestrationCommandReceipt,
  OrchestrationEvent,
} from './schemas'
import { orchestrationCommandReceiptSchema } from './schemas'
import { db as defaultDb } from '../db/client'
import { orchestrationCommandReceipts, type OrchestrationCommandReceiptRow } from '../db/schema'
import type { OrchestrationDatabase } from './event-store'
import {
  orchestrationCommandSummary,
  recordChatPipelineInfo,
  recordChatPipelineWarning,
} from './orchestration-logging'

export class OrchestrationCommandReceipts {
  private readonly database: OrchestrationDatabase

  constructor(database: OrchestrationDatabase = defaultDb) {
    this.database = database
  }

  find(commandId: string) {
    const row = this.database
      .select()
      .from(orchestrationCommandReceipts)
      .where(eq(orchestrationCommandReceipts.commandId, commandId))
      .get()

    return row ? rowToReceipt(row) : null
  }

  recordAccepted(command: OrchestrationCommand, events: OrchestrationEvent[]) {
    const sequence = lastSequence(events)
    const aggregate = commandAggregate(command)
    const receipt = {
      acceptedAt: commandTimestamp(command),
      aggregateId: aggregate.id,
      aggregateKind: aggregate.kind,
      commandId: command.commandId,
      commandJson: JSON.stringify(command),
      commandType: command.type,
      error: null,
      resultJson: JSON.stringify({ sequence }),
      resultSequence: sequence,
      status: 'accepted' as const,
    }

    this.database.insert(orchestrationCommandReceipts).values(receipt).run()
    recordChatPipelineInfo('chat.pipeline.command_receipt.accepted', {
      ...orchestrationCommandSummary(command),
      resultSequence: sequence,
    })

    return rowToReceipt(receipt)
  }

  recordRejected(command: OrchestrationCommand, error: unknown) {
    const aggregate = commandAggregate(command)
    const receipt = {
      acceptedAt: commandTimestamp(command),
      aggregateId: aggregate.id,
      aggregateKind: aggregate.kind,
      commandId: command.commandId,
      commandJson: JSON.stringify(command),
      commandType: command.type,
      error: errorMessage(error),
      resultJson: null,
      resultSequence: null,
      status: 'rejected' as const,
    }

    this.database.insert(orchestrationCommandReceipts).values(receipt).run()
    recordChatPipelineWarning('chat.pipeline.command_receipt.rejected', {
      ...orchestrationCommandSummary(command),
      error: receipt.error,
    })

    return rowToReceipt(receipt)
  }
}

function commandAggregate(command: OrchestrationCommand) {
  if (isProjectCommand(command)) {
    return { id: command.projectId, kind: 'project' as const }
  }

  return { id: command.threadId, kind: 'thread' as const }
}

function isProjectCommand(
  command: OrchestrationCommand,
): command is Extract<
  OrchestrationCommand,
  { type: 'project.create' | 'project.meta.update' | 'project.delete' }
> {
  return command.type.startsWith('project.')
}

function commandTimestamp(command: OrchestrationCommand) {
  if ('createdAt' in command) return command.createdAt
  if ('updatedAt' in command) return command.updatedAt
  if ('deletedAt' in command) return command.deletedAt
  if ('archivedAt' in command) return command.archivedAt
  if ('completedAt' in command) return command.completedAt

  return new Date().toISOString()
}

function lastSequence(events: OrchestrationEvent[]) {
  return events.at(-1)?.sequence ?? null
}

function rowToReceipt(row: OrchestrationCommandReceiptRow): OrchestrationCommandReceipt {
  return v.parse(orchestrationCommandReceiptSchema, {
    acceptedAt: row.acceptedAt,
    aggregateId: row.aggregateId,
    aggregateKind: row.aggregateKind,
    commandId: row.commandId,
    commandType: row.commandType,
    error: row.error,
    resultSequence: row.resultSequence,
    status: row.status,
  })
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message

  return String(error)
}
