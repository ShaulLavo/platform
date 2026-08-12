import * as v from 'valibot'
import type { ChatAttachment, ChatAttachmentUpload } from '@workspace/contracts'
import { defaultAttachmentsDir, writeAttachmentFromDataUrl } from '../attachments/store'
import { migrateOrchestrationDatabase } from '../db/migrations'
import { orchestrationErrors } from '../observability'
import {
  clientOrchestrationCommandSchema,
  type OrchestrationCommand,
  type OrchestrationEvent,
  type OrchestrationThreadDetailPageInput,
} from './schemas'
import { CheckpointReactor } from './checkpoint-reactor'
import { isDurableCommandRejection, OrchestrationCommandReceipts } from './command-receipts'
import { decideOrchestrationCommand } from './decider'
import { OrchestrationEventStore, type OrchestrationDatabase } from './event-store'
import { OrchestrationProjectionPipeline } from './projection-pipeline'
import { ThreadBranchReactor } from './thread-branch-reactor'
import { ensureCommandWorkspaceRoot } from './workspace-root'
import { ProviderCommandReactor } from './provider-command-reactor'
import { ProviderRuntimeIngestion } from './provider-runtime-ingestion'
import { ThreadDeletionReactor } from './thread-deletion-reactor'
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
import {
  OrchestrationDomainEventBus,
  OrchestrationStreams,
  type OrchestrationDomainEventReactor,
  type OrchestrationStreamOptions,
} from './streams'

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
  private checkpointReactor: CheckpointReactor | null = null
  private threadBranchReactor: ThreadBranchReactor | null = null
  private readonly database: OrchestrationDatabase
  private readonly domainEvents = new OrchestrationDomainEventBus()
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
    this.subscribeProviderCommandReactor()
  }

  /**
   * Attach a server-side reactor to the committed domain-event stream. Reactors
   * observe events only after they are durable, so returning an unsubscribe
   * handle — rather than a constructor slot — is what lets later reactors
   * (checkpoints, thread deletion) attach without the engine knowing them.
   */
  subscribeDomainEvents(reactor: OrchestrationDomainEventReactor) {
    return this.domainEvents.subscribe(reactor)
  }

  /**
   * The single client ingress: both `POST /orchestration/commands` and the
   * `dispatchCommand` WS RPC land here. Attachment bytes are written to the blob
   * store and stripped from the command before it is dispatched, so base64 never
   * reaches the append-only event log, the projection, or a snapshot.
   */
  async dispatchClientCommand(command: unknown) {
    const parsed = v.parse(clientOrchestrationCommandSchema, command)
    // Before the decider, which is pure and runs inside the command
    // transaction: a project that opted into making its workspace root needs
    // that directory to exist by the time anything is written about it.
    await ensureCommandWorkspaceRoot(parsed)
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

  /** One page of rows strictly older than the boundary the caller already holds. */
  threadDetailPage(input: OrchestrationThreadDetailPageInput) {
    return this.snapshotQuery.threadDetailPage(input)
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

  /**
   * Provider work first: ingestion is what settles a turn, and settling a turn
   * is what gives the checkpoint reactor something to capture.
   */
  async providerRuntimeIdle() {
    await this.providerCommandReactor?.drain()
    await this.checkpointReactor?.drain()
    await this.threadBranchReactor?.drain()
  }

  private dispatchNow(
    command: OrchestrationCommand,
    attachmentIngest?: CommandAttachmentIngest,
  ): OrchestrationDispatchResult {
    const startedAt = performance.now()
    const summary = orchestrationCommandSummary(command, attachmentIngest)
    recordChatPipelineInfo('chat.pipeline.command.start', summary)

    const existing = this.receipts.find(command.commandId)
    if (existing?.status === 'accepted') {
      recordChatPipelineInfo('chat.pipeline.command.deduped', {
        ...summary,
        resultSequence: existing.resultSequence,
      })
      return dedupedDispatchResult(existing)
    }
    if (existing) {
      recordChatPipelineWarning('chat.pipeline.command.previously_rejected', {
        ...summary,
        storedError: existing.error,
      })
      throw previouslyRejectedCommandError(existing)
    }

    const committed = this.commitNewCommand(command, summary)
    recordChatPipelineInfo('chat.pipeline.command.complete', {
      ...summary,
      ...orchestrationEventBatchSummary(committed.events),
      durationMs: elapsedMs(startedAt),
      reactorCount: committed.published.reactorCount,
      reactorFailures: committed.published.failures,
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
      const committed = this.commitCommand(command, pendingEvents)
      this.readModel = projectEvents(committed.events, this.readModel)

      return { ...committed, published: this.publishCommitted(committed.events) }
    } catch (error) {
      this.recordDispatchFailure(command, summary, error)
      throw error
    }
  }

  /**
   * A failed dispatch leaves two things to settle, in this order: the in-memory
   * read model may now lag durable truth, and only *then* can the failure be
   * classified — because whether a rejection is durable is a property of the
   * error, and the reconcile must not be skipped by an early return.
   */
  private recordDispatchFailure(
    command: OrchestrationCommand,
    summary: OrchestrationCommandSummary,
    error: unknown,
  ) {
    const reconciled = this.reconcileReadModel()
    const durable = isDurableCommandRejection(error)
    if (durable) this.receipts.recordRejected(command, error)

    recordChatPipelineWarning('chat.pipeline.command.rejected', {
      ...summary,
      ...reconciled,
      error,
      receiptRecorded: durable,
      retryable: !durable,
    })
  }

  /**
   * Re-derives the command read model from the event log. Without this a
   * dispatch that threw after its events were durable leaves the engine
   * deciding later commands against a read model that is missing them.
   */
  private reconcileReadModel() {
    try {
      const events = this.eventStore.readAfter({ afterSequence: this.readModel.sequence })
      if (events.length === 0) return { reconciledEventCount: 0 }

      this.readModel = projectEvents(events, this.readModel)
      const published = this.publishCommitted(events)

      return {
        reconciledEventCount: events.length,
        reconciledSequence: this.readModel.sequence,
        reconcileReactorFailures: published.failures,
      }
    } catch (error) {
      // Reconcile is best-effort: the dispatch failure it is annotating is the
      // error the caller has to see, so this one rides along as a field.
      return { reconcileError: errorMessage(error), reconciledEventCount: 0 }
    }
  }

  private publishCommitted(events: OrchestrationEvent[]) {
    this.streams.publish(events)

    return this.domainEvents.publish(events)
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

  /**
   * The provider reactor is the engine's own consumer, but it attaches through
   * the same bus as everyone else — there is no privileged slot left to grow.
   */
  private subscribeProviderCommandReactor() {
    const reactor = this.providerCommandReactor
    if (!reactor) return

    this.domainEvents.subscribe({
      handleEvents: (events) => reactor.handleEvents(events),
      name: 'provider-command-reactor',
    })
  }

  /**
   * The pre-turn baseline is enqueued while `thread.turn-start-requested` is
   * still being published, so draining the reactor here is what puts the
   * capture strictly before the provider is allowed to touch the worktree.
   */
  private checkpointBaselineSettled() {
    return this.checkpointReactor?.drain() ?? Promise.resolve()
  }

  /**
   * Checkpoints are photographs of a git worktree, so a deployment without a
   * git service has nothing to photograph and the reactor stays off rather than
   * failing once per turn.
   */
  private subscribeCheckpointReactor(
    git: GitService | undefined,
    providerService: ProviderService,
  ) {
    if (!git) return

    this.checkpointReactor = new CheckpointReactor({
      dispatch: (command) => this.dispatch(command),
      getReadModel: () => this.readModel,
      git,
      providerService,
    })
    this.domainEvents.subscribe(this.checkpointReactor)
    // Rides the same git handle: without it `thread.branch` is null forever and
    // every branch-gated affordance is unreachable.
    this.threadBranchReactor = new ThreadBranchReactor({
      dispatch: (command) => this.dispatch(command),
      getReadModel: () => this.readModel,
      git,
    })
    this.domainEvents.subscribe(this.threadBranchReactor)
  }

  private createProviderCommandReactor(options: OrchestrationEngineOptions) {
    if (!options.providerRuntime) return null

    const providerRuntimeOptions =
      typeof options.providerRuntime === 'object' ? options.providerRuntime : null
    const adapterRegistry =
      providerRuntimeOptions?.adapterRegistry ?? createDefaultProviderAdapterRegistry()
    const providerService = providerRuntimeOptions?.providerService
      ? providerRuntimeOptions.providerService
      : new ProviderService({
          adapterRegistry,
          sessionDirectory: new ProviderSessionDirectory(this.database),
        })
    const ingestion = new ProviderRuntimeIngestion((command) => this.dispatch(command), {
      getReadModel: () => this.readModel,
      onLiveness: (threadId) => providerService.markSessionSeen(threadId),
    })

    // Stopping a deleted thread's session is only meaningful where a runtime
    // exists to stop, so the deletion reactor attaches with this one.
    this.domainEvents.subscribe(
      new ThreadDeletionReactor({
        attachmentsDir: this.attachmentsDir,
        database: this.database,
        providerService,
      }),
    )
    this.subscribeCheckpointReactor(providerRuntimeOptions?.checkpointGit, providerService)

    return new ProviderCommandReactor({
      beforeTurnStart: () => this.checkpointBaselineSettled(),
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
    // The measured length wins over the declared one. Storing what the client
    // said would leave the timeline reporting a size the blob on disk does not
    // have, and every reader downstream trusting it.
    kept.push({ ...attachmentMetadata(attachment), sizeBytes: written.bytesWritten })
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
