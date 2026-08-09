import { eq } from 'drizzle-orm'
import * as v from 'valibot'
import type {
  OrchestrationCommand,
  OrchestrationCommandReceipt,
  OrchestrationEvent,
} from './schemas'
import { orchestrationCommandReceiptSchema } from './schemas'
import { getDefaultPlatformDatabase } from '../db/client'
import { isEvlogError } from '../observability'
import { orchestrationCommandReceipts, type OrchestrationCommandReceiptRow } from '../db/schema'
import type { OrchestrationDatabase } from './event-store'
import {
  orchestrationCommandSummary,
  recordChatPipelineInfo,
  recordChatPipelineWarning,
} from './orchestration-logging'

export class OrchestrationCommandReceipts {
  private readonly database: OrchestrationDatabase

  constructor(database: OrchestrationDatabase = getDefaultPlatformDatabase()) {
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
      acceptedAt: new Date().toISOString(),
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
      acceptedAt: new Date().toISOString(),
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

/**
 * A rejection receipt is permanent: once written, that `commandId` is poisoned
 * and can never be retried. Only a decision about the command *itself* earns
 * one — the catalogued invariant violations the decider raises, which are
 * structured errors carrying a 4xx status and which will fail identically no
 * matter how often the command is replayed.
 *
 * Everything else — a plain `Error`, a `SQLiteError` from a disk blip, any 5xx
 * structured error — is an infrastructure failure whose next attempt may well
 * succeed. Those leave no receipt at all, so the client can retry the same
 * `commandId` and still get exactly-once semantics.
 *
 * The test is the structured error's identity (`EvlogError` + `status`), never
 * its message text: rewording a catalog entry must not silently change which
 * failures become permanent.
 */
export function isDurableCommandRejection(error: unknown) {
  if (!isEvlogError(error)) return false

  return error.status >= 400 && error.status < 500
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
