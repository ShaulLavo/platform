import * as v from 'valibot'
import type { ChatAttachment, ChatAttachmentUpload } from '@workspace/contracts'
import { defaultAttachmentsDir, writeAttachmentFromDataUrl } from '../attachments/store'
import { migrateOrchestrationDatabase } from '../db/migrations'
import { orchestrationErrors } from '../observability'
import { clientOrchestrationCommandSchema, type OrchestrationCommand } from './schemas'
import { OrchestrationCommandReceipts } from './command-receipts'
import { decideOrchestrationCommand } from './decider'
import { OrchestrationEventStore, type OrchestrationDatabase } from './event-store'
import { OrchestrationProjectionPipeline } from './projection-pipeline'
import { ProviderCommandReactor } from './provider-command-reactor'
import { ProviderRuntimeIngestion } from './provider-runtime-ingestion'
import {
  createDefaultProviderAdapterRegistry,
  type ProviderAdapterRegistry,
} from '../provider/provider-adapter-registry'
import { ProviderService } from '../provider/provider-service'
import { ProviderSessionDirectory } from '../provider/provider-session-directory'
import type { GitService } from '../git/service'
import {
  orchestrationCommandSummary,
  orchestrationEventBatchSummary,
  recordChatPipelineInfo,
  recordChatPipelineWarning,
  type CommandAttachmentIngest,
} from './orchestration-logging'
import { projectEvents } from './projector'
import type { OrchestrationReadModel } from './read-model'
import { OrchestrationSnapshotQuery } from './snapshot-query'
import { OrchestrationStreams, type OrchestrationStreamOptions } from './streams'

export type OrchestrationDispatchResult = {
  deduped: boolean
  receipt: ReturnType<OrchestrationCommandReceipts['find']>
  sequence: number
}

export type OrchestrationEngineOptions = {
  attachmentsDir?: string
  providerRuntime?:
    | boolean
    | {
        adapterRegistry?: ProviderAdapterRegistry
        checkpointGit?: GitService
        providerService?: ProviderService
      }
}

type OrchestrationCommandSummary = ReturnType<typeof orchestrationCommandSummary>

export class OrchestrationEngine {
  private queue = Promise.resolve()
  private readonly attachmentsDir: string
  private readonly database: OrchestrationDatabase
  private readonly receipts: OrchestrationCommandReceipts
  private readonly eventStore: OrchestrationEventStore
  private readonly projectionPipeline: OrchestrationProjectionPipeline
  private readonly providerCommandReactor: ProviderCommandReactor | null
  private readonly snapshotQuery: OrchestrationSnapshotQuery
  private readonly streams: OrchestrationStreams
  private readModel: OrchestrationReadModel

  constructor(database: OrchestrationDatabase, options: OrchestrationEngineOptions = {}) {
    this.attachmentsDir = options.attachmentsDir ?? defaultAttachmentsDir()
    this.database = database
    migrateOrchestrationDatabase(database)
    this.eventStore = new OrchestrationEventStore(database)
    this.receipts = new OrchestrationCommandReceipts(database)
    this.projectionPipeline = new OrchestrationProjectionPipeline(database, this.eventStore)
    this.snapshotQuery = new OrchestrationSnapshotQuery(database)
    this.streams = new OrchestrationStreams(this.snapshotQuery)
    this.projectionPipeline.catchUp()
    this.readModel = this.snapshotQuery.fullReadModel()
    this.providerCommandReactor = this.createProviderCommandReactor(options)
  }

  /**
   * The single client ingress: both `POST /orchestration/commands` and the
   * `dispatchCommand` WS RPC land here. Attachment bytes are written to the blob
   * store and stripped from the command before it is dispatched, so base64 never
   * reaches the append-only event log, the projection, or a snapshot.
   */
  async dispatchClientCommand(command: unknown) {
    const parsed = v.parse(clientOrchestrationCommandSchema, command)
    const ingested = await ingestCommandAttachments(parsed, this.attachmentsDir)

    return this.dispatch(ingested.command, ingested.attachmentIngest)
  }

  dispatch(command: OrchestrationCommand, attachmentIngest?: CommandAttachmentIngest) {
    recordChatPipelineInfo(
      'chat.pipeline.command.queued',
      orchestrationCommandSummary(command, attachmentIngest),
    )
    const task = this.queue.then(() => this.dispatchNow(command, attachmentIngest))
    this.queue = task.then(noop, noop)

    return task
  }

  shellSnapshot() {
    return this.snapshotQuery.shellSnapshot()
  }

  threadDetailSnapshot(threadId: string) {
    return this.snapshotQuery.threadDetailSnapshot(threadId)
  }

  replay(input: Parameters<OrchestrationEventStore['readAfter']>[0]) {
    return { events: this.eventStore.readAfter(input) }
  }

  shellStream(options?: OrchestrationStreamOptions) {
    return this.streams.shell(options)
  }

  threadDetailStream(threadId: string, options?: OrchestrationStreamOptions) {
    return this.streams.threadDetail(threadId, options)
  }

  readModelSnapshot() {
    return this.readModel
  }

  providerRuntimeIdle() {
    return this.providerCommandReactor?.drain() ?? Promise.resolve()
  }

  private dispatchNow(
    command: OrchestrationCommand,
    attachmentIngest?: CommandAttachmentIngest,
  ): OrchestrationDispatchResult {
    const startedAt = performance.now()
    const summary = orchestrationCommandSummary(command, attachmentIngest)
    recordChatPipelineInfo('chat.pipeline.command.start', summary)

    const existing = this.receipts.find(command.commandId)
    if (existing) {
      if (existing.status === 'accepted') {
        recordChatPipelineInfo('chat.pipeline.command.deduped', {
          ...summary,
          resultSequence: existing.resultSequence,
        })
        return dedupedDispatchResult(existing)
      }

      recordChatPipelineWarning('chat.pipeline.command.previously_rejected', {
        ...summary,
        storedError: existing.error,
      })
      throw previouslyRejectedCommandError(existing)
    }

    const committed = this.commitNewCommand(command, summary)
    recordChatPipelineInfo('chat.pipeline.command.committed', {
      ...summary,
      ...orchestrationEventBatchSummary(committed.events),
      sequence: committed.sequence,
    })
    this.readModel = projectEvents(committed.events, this.readModel)
    recordChatPipelineInfo('chat.pipeline.read_model.projected', {
      ...summary,
      ...orchestrationEventBatchSummary(committed.events),
    })
    this.streams.publish(committed.events)
    recordChatPipelineInfo('chat.pipeline.streams.published', {
      ...summary,
      ...orchestrationEventBatchSummary(committed.events),
    })
    this.providerCommandReactor?.handleEvents(committed.events)
    recordChatPipelineInfo('chat.pipeline.provider_reactor.notified', {
      ...summary,
      ...orchestrationEventBatchSummary(committed.events),
      enabled: this.providerCommandReactor !== null,
    })
    recordChatPipelineInfo('chat.pipeline.command.complete', {
      ...summary,
      durationMs: elapsedMs(startedAt),
      sequence: committed.sequence,
    })

    return {
      deduped: false,
      receipt: committed.receipt,
      sequence: committed.sequence,
    }
  }

  private commitNewCommand(command: OrchestrationCommand, summary: OrchestrationCommandSummary) {
    try {
      const pendingEvents = decideOrchestrationCommand(command, this.readModel)
      recordChatPipelineInfo('chat.pipeline.command.decided', {
        ...summary,
        eventCount: pendingEvents.length,
        eventTypes: pendingEvents.map((event) => event.type),
      })

      return this.commitCommand(command, pendingEvents)
    } catch (error) {
      this.receipts.recordRejected(command, error)
      recordChatPipelineWarning('chat.pipeline.command.rejected', {
        ...summary,
        error,
      })
      throw error
    }
  }

  private commitCommand(
    command: OrchestrationCommand,
    pendingEvents: Parameters<OrchestrationEventStore['append']>[0],
  ) {
    return this.database.transaction((transaction) => {
      const database = transaction as unknown as OrchestrationDatabase
      const eventStore = new OrchestrationEventStore(database)
      const projectionPipeline = new OrchestrationProjectionPipeline(database, eventStore)
      const receipts = new OrchestrationCommandReceipts(database)
      const events = eventStore.append(pendingEvents)
      projectionPipeline.applyEvents(events)
      const receipt = receipts.recordAccepted(command, events)

      return {
        events,
        receipt,
        sequence: events.at(-1)?.sequence ?? eventStore.currentSequence(),
      }
    })
  }

  private createProviderCommandReactor(options: OrchestrationEngineOptions) {
    if (!options.providerRuntime) return null

    const providerRuntimeOptions =
      typeof options.providerRuntime === 'object' ? options.providerRuntime : null
    const adapterRegistry =
      providerRuntimeOptions?.adapterRegistry ?? createDefaultProviderAdapterRegistry()
    const ingestion = new ProviderRuntimeIngestion((command) => this.dispatch(command), {
      getReadModel: () => this.readModel,
    })
    const providerService = providerRuntimeOptions?.providerService
      ? providerRuntimeOptions.providerService
      : new ProviderService({
          adapterRegistry,
          sessionDirectory: new ProviderSessionDirectory(this.database),
        })

    return new ProviderCommandReactor({
      checkpointGit: providerRuntimeOptions?.checkpointGit ?? null,
      dispatch: (command) => this.dispatch(command),
      getReadModel: () => this.readModel,
      ingestion,
      providerService,
    })
  }
}

/**
 * Write-through between parse and dispatch. Attachment bytes hit the blob store
 * exactly once here; everything downstream sees metadata only.
 */
async function ingestCommandAttachments(
  command: OrchestrationCommand,
  attachmentsDir: string,
): Promise<{ attachmentIngest?: CommandAttachmentIngest; command: OrchestrationCommand }> {
  if (command.type !== 'thread.turn.start') return { command }
  if (command.message.attachments.length === 0) return { command }

  const ingested = await persistTurnAttachments(command.message.attachments, attachmentsDir)

  return {
    attachmentIngest: ingested.attachmentIngest,
    command: {
      ...command,
      message: { ...command.message, attachments: ingested.attachments },
    },
  }
}

async function persistTurnAttachments(
  attachments: readonly ChatAttachmentUpload[],
  attachmentsDir: string,
) {
  const kept: ChatAttachment[] = []
  const dropReasons: string[] = []
  let bytesPersisted = 0
  let persisted = 0

  for (const attachment of attachments) {
    if (!attachment.dataUrl) {
      kept.push(attachmentMetadata(attachment))
      continue
    }

    const written = await writeAttachment(attachment, attachmentsDir)
    // A broken paste drops its image, never the user's message.
    if ('dropReason' in written) {
      dropReasons.push(written.dropReason)
      continue
    }

    bytesPersisted += written.bytesWritten
    persisted += 1
    kept.push(attachmentMetadata(attachment))
  }

  return {
    attachmentIngest: { bytesPersisted, dropReasons, dropped: dropReasons.length, persisted },
    attachments: kept,
  }
}

async function writeAttachment(
  attachment: ChatAttachmentUpload,
  attachmentsDir: string,
): Promise<{ bytesWritten: number } | { dropReason: string }> {
  try {
    return await writeAttachmentFromDataUrl({ attachment, attachmentsDir })
  } catch (error) {
    return { dropReason: `${attachment.id}: ${errorMessage(error)}` }
  }
}

function attachmentMetadata(attachment: ChatAttachmentUpload): ChatAttachment {
  return {
    type: attachment.type,
    id: attachment.id,
    name: attachment.name,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
  }
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message

  return String(error)
}

function noop() {}

function elapsedMs(startedAt: number) {
  return Math.round((performance.now() - startedAt) * 100) / 100
}

function dedupedDispatchResult(
  receipt: NonNullable<ReturnType<OrchestrationCommandReceipts['find']>>,
) {
  return {
    deduped: true,
    receipt,
    sequence: receipt.resultSequence ?? 0,
  }
}

function previouslyRejectedCommandError(
  receipt: NonNullable<ReturnType<OrchestrationCommandReceipts['find']>>,
) {
  return orchestrationErrors.COMMAND_PREVIOUSLY_REJECTED({
    commandId: receipt.commandId,
    internal: { storedError: receipt.error },
    message: receipt.error ?? undefined,
  })
}
