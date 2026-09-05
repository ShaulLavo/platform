import * as v from 'valibot'
import type { ChatAttachment, ChatAttachmentUpload } from '@workspace/contracts'
import { defaultAttachmentsDir, writeAttachmentFromDataUrl } from '../attachments/store'
import { migrateOrchestrationDatabase } from '../db/migrations'
import { orchestrationErrors } from '../observability'
import {
  clientOrchestrationCommandSchema,
  type OrchestrationCommand,
  type OrchestrationDispatchResult,
  type OrchestrationEvent,
  type OrchestrationSessionDetailPageInput,
} from './schemas'
import { CheckpointReactor } from './checkpoint-reactor'
import { isDurableCommandRejection, OrchestrationCommandReceipts } from './command-receipts'
import { decideOrchestrationCommand } from './decider'
import { OrchestrationEventStore, type OrchestrationDatabase } from './event-store'
import { OrchestrationProjectionPipeline } from './projection-pipeline'
import { bootstrapOrchestration } from './bootstrap'
import { createEmptyReadModel } from './read-model'
import { prepareProjectRegistration, type RegistrationBoundary } from './registration'
import { registrationResult } from './registration-decider'
import { commandFingerprint } from './utils/command-intent'
import { internalCommandKey } from './utils/repository-ids'
import { verifyReceiptIntent } from './command-receipts'
import { sessionDomainErrors } from './structured-errors'
import {
  commandIdSchema,
  type ClientOrchestrationCommand,
  type OrchestrationCommandReceipt,
} from '@workspace/contracts'
import { ProviderCommandReactor } from './provider-command-reactor'
import { ProviderRuntimeIngestion, type ProviderRuntimeSource } from './provider-runtime-ingestion'
import { SessionDeletionReactor } from './session-deletion-reactor'
import { SessionDiscoveryReconciler } from './session-discovery'
import { resolveSessionOwner } from './session-owner'
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
import type { OrchestrationReadModel, OrchestrationProjectedSession } from './read-model'
import { ReactorScheduler } from './reactor-scheduler'
import { OrchestrationSnapshotQuery } from './snapshot-query'
import {
  OrchestrationDomainEventBus,
  OrchestrationStreams,
  type OrchestrationDomainEventReactor,
  type OrchestrationStreamOptions,
} from './streams'

export type OrchestrationEngineOptions = {
  registration?: RegistrationBoundary
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
  private deletionReactor: SessionDeletionReactor | null = null
  private discovery: SessionDiscoveryReconciler | null = null
  private providerService: ProviderService | null = null
  private readonly registration: RegistrationBoundary | undefined
  private readonly preparationLanes = new Map<string, Promise<OrchestrationDispatchResult>>()
  readonly ready: Promise<void>
  private readonly database: OrchestrationDatabase
  private readonly domainEvents = new OrchestrationDomainEventBus()
  private readonly receipts: OrchestrationCommandReceipts
  private readonly eventStore: OrchestrationEventStore
  private readonly projectionPipeline: OrchestrationProjectionPipeline
  private providerCommandReactor: ProviderCommandReactor | null = null
  private readonly reactors = new ReactorScheduler()
  private readonly snapshotQuery: OrchestrationSnapshotQuery
  private readonly streams: OrchestrationStreams
  private readModel: OrchestrationReadModel = createEmptyReadModel()

  constructor(database: OrchestrationDatabase, options: OrchestrationEngineOptions = {}) {
    this.attachmentsDir = options.attachmentsDir ?? defaultAttachmentsDir()
    this.database = database
    this.registration = options.registration
    this.eventStore = new OrchestrationEventStore(database)
    this.receipts = new OrchestrationCommandReceipts(database)
    this.projectionPipeline = new OrchestrationProjectionPipeline(database, this.eventStore)
    this.snapshotQuery = new OrchestrationSnapshotQuery(database)
    this.streams = new OrchestrationStreams(this.snapshotQuery, { database })
    this.ready = bootstrapOrchestration({
      migrate: () => {
        migrateOrchestrationDatabase(database)
      },
      catchUp: () => {
        this.projectionPipeline.catchUp()
      },
      load: () => {
        this.readModel = this.snapshotQuery.fullReadModel()
        this.providerCommandReactor = this.createProviderCommandReactor(options)
        this.createDeletionReactor()
        this.createDiscoveryReconciler()
      },
      recover: () => this.recover(),
      startReactors: () => {
        this.subscribeProviderCommandReactor()
        this.scheduleQueuedStarts()
        this.discovery?.start()
      },
    })
  }

  // Reactors observe only committed domain events.
  subscribeDomainEvents(reactor: OrchestrationDomainEventReactor) {
    return this.domainEvents.subscribe(reactor)
  }

  // Both HTTP and WebSocket ingress persist attachments before dispatching metadata.
  async dispatchClientCommand(command: unknown) {
    const parsed = v.parse(clientOrchestrationCommandSchema, command)
    await this.ready
    const existingLane = this.preparationLanes.get(parsed.commandId)
    const fingerprint = commandFingerprint(parsed)
    if (existingLane) {
      await existingLane.catch(noop)
      return this.prepareAndDispatch(parsed, fingerprint)
    }
    const task = this.prepareAndDispatch(parsed, fingerprint)
    this.preparationLanes.set(parsed.commandId, task)
    try {
      return await task
    } finally {
      this.preparationLanes.delete(parsed.commandId)
    }
  }

  private async prepareAndDispatch(command: ClientOrchestrationCommand, fingerprint: string) {
    const existing = this.receipts.find(command.commandId)
    if (existing) return this.dispatchFromReceipt(existing, command.type, fingerprint)
    const prepared = await this.prepare(command, fingerprint)
    const ingested = await ingestCommandAttachments(prepared, this.attachmentsDir)
    const result = await this.enqueue(ingested.command, ingested.attachmentIngest, fingerprint)
    if (command.type === 'project.create') void this.discovery?.requestScan()
    return result
  }

  private async prepare(
    command: ClientOrchestrationCommand,
    fingerprint: string,
  ): Promise<OrchestrationCommand> {
    if (command.type !== 'project.create') return command
    if (!this.registration) {
      throw orchestrationErrors.WORKSPACE_ROOT_NOT_DIRECTORY({
        workspaceRoot: command.workspaceRoot,
      })
    }
    const prepared = await prepareProjectRegistration(
      command,
      this.registration,
      this.readModel,
      fingerprint,
    )
    await this.requireNoLiveProviderForRevival(prepared.projectId, prepared.worktreeId)
    return prepared
  }

  async dispatch(command: OrchestrationCommand, attachmentIngest?: CommandAttachmentIngest) {
    await this.ready
    return this.enqueue(command, attachmentIngest)
  }

  async dispatchProviderCommand(command: OrchestrationCommand, source: ProviderRuntimeSource) {
    await this.ready
    return this.enqueueProviderCommand(command, source)
  }

  private schedule<T>(operation: () => T | Promise<T>) {
    const task = this.queue.then(operation)
    this.queue = task.then(noop, noop)
    return task
  }

  private enqueue(
    command: OrchestrationCommand,
    attachmentIngest?: CommandAttachmentIngest,
    fingerprint = commandFingerprint(command),
  ) {
    const intent = 'intentFingerprint' in command ? command.intentFingerprint : fingerprint
    return this.schedule(() => this.dispatchNow(command, attachmentIngest, intent))
  }

  private enqueueProviderCommand(command: OrchestrationCommand, source: ProviderRuntimeSource) {
    return this.schedule(() => {
      if (!this.isCurrentProviderSource(command, source)) return
      return this.dispatchNow(command, undefined, commandFingerprint(command))
    })
  }

  private isCurrentProviderSource(command: OrchestrationCommand, source: ProviderRuntimeSource) {
    const session = this.readModel.sessions.get(source.sessionId)
    if (!session || session.deletedAt) return false
    const turn = session.latestTurn
    const expectedEpoch = turn?.runtimeEpoch ?? session.runtime?.runtimeEpoch
    if (expectedEpoch && expectedEpoch !== source.runtimeEpoch) return false
    if (command.type !== 'session.runtime.set') return true
    if (turn?.providerStartState === 'queued') return false
    const activeTurnId = command.runtime.activeTurnId
    return !activeTurnId || !turn || activeTurnId === turn.turnId
  }

  async shellSnapshot() {
    await this.ready
    return this.snapshotQuery.shellSnapshot()
  }
  async sessionDetailSnapshot(sessionId: string) {
    await this.ready
    return this.snapshotQuery.sessionDetailSnapshot(sessionId)
  }
  async sessionDetailPage(input: OrchestrationSessionDetailPageInput) {
    await this.ready
    return this.snapshotQuery.sessionDetailPage(input)
  }
  async replay(input: Parameters<OrchestrationEventStore['readAfter']>[0]) {
    await this.ready
    return { events: this.eventStore.readAfter(input) }
  }
  async *shellStream(options?: OrchestrationStreamOptions) {
    await this.ready
    yield* this.streams.shell(options)
  }
  async *sessionDetailStream(sessionId: string, options?: OrchestrationStreamOptions) {
    await this.ready
    yield* this.streams.sessionDetail(sessionId, options)
  }
  async readModelSnapshot() {
    await this.ready
    return this.readModel
  }
  async providerRuntimeIdle() {
    await this.ready
    return this.reactors.idle()
  }
  async close() {
    await this.ready
    await this.discovery?.close()
    await this.queue
  }

  private dispatchFromReceipt(
    receipt: OrchestrationCommandReceipt,
    type: string,
    fingerprint: string,
  ) {
    verifyReceiptIntent(receipt, type, fingerprint)
    if (receipt.status === 'rejected') throw previouslyRejectedCommandError(receipt)
    return { deduped: true, sequence: receipt.resultSequence, result: receipt.result }
  }

  private dispatchNow(
    command: OrchestrationCommand,
    attachmentIngest: CommandAttachmentIngest | undefined,
    fingerprint: string,
  ): OrchestrationDispatchResult {
    const startedAt = performance.now()
    const summary = orchestrationCommandSummary(command, attachmentIngest)
    recordChatPipelineInfo('chat.pipeline.command.start', summary)

    const existing = this.receipts.find(command.commandId)
    if (existing) return this.dispatchFromReceipt(existing, command.type, fingerprint)

    const committed = this.commitNewCommand(command, summary, fingerprint)
    recordChatPipelineInfo('chat.pipeline.command.complete', {
      ...summary,
      ...orchestrationEventBatchSummary(committed.events),
      durationMs: elapsedMs(startedAt),
      reactorCount: committed.published.reactorCount,
      reactorFailures: committed.published.failures,
      sequence: committed.sequence,
      result: committed.receipt.result,
    })

    return {
      deduped: false,
      sequence: committed.sequence,
      result: committed.receipt.result,
    }
  }

  private commitNewCommand(
    command: OrchestrationCommand,
    summary: OrchestrationCommandSummary,
    fingerprint: string,
  ) {
    try {
      const pendingEvents = decideOrchestrationCommand(command, this.readModel)
      recordChatPipelineInfo('chat.pipeline.command.decided', {
        ...summary,
        eventCount: pendingEvents.length,
        eventTypes: pendingEvents.map((event) => event.type),
      })
      const committed = this.commitCommand(command, pendingEvents, fingerprint)
      this.readModel = this.snapshotQuery.refreshReadModel(this.readModel, committed.events)

      return { ...committed, published: this.publishCommitted(committed.events) }
    } catch (error) {
      this.recordDispatchFailure(command, summary, error, fingerprint)
      throw error
    }
  }

  // Reconcile durable events before classifying a failed dispatch for its receipt.
  private recordDispatchFailure(
    command: OrchestrationCommand,
    summary: OrchestrationCommandSummary,
    error: unknown,
    fingerprint: string,
  ) {
    const reconciled = this.reconcileReadModel()
    const durable = isDurableCommandRejection(error)
    if (durable) this.receipts.recordRejected(command, error, fingerprint)

    recordChatPipelineWarning('chat.pipeline.command.rejected', {
      ...summary,
      ...reconciled,
      error,
      receiptRecorded: durable,
      retryable: !durable,
    })
  }

  // A commit can succeed before cache refresh fails; rebuild from durable projections.
  private reconcileReadModel() {
    try {
      this.projectionPipeline.catchUp()
      const events: OrchestrationEvent[] = []
      let sequence = this.readModel.sequence
      for (;;) {
        const page = this.eventStore.readAfter({ afterSequence: sequence })
        if (!page.length) break
        events.push(...page)
        const last = page.at(-1)
        if (last) sequence = last.sequence
      }
      if (events.length === 0) return { reconciledEventCount: 0 }

      this.readModel = this.snapshotQuery.refreshReadModel(this.readModel, events)
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
    fingerprint: string,
  ) {
    return this.database.transaction((transaction) => {
      const database = transaction as unknown as OrchestrationDatabase
      const eventStore = new OrchestrationEventStore(database)
      const projectionPipeline = new OrchestrationProjectionPipeline(database, eventStore)
      const receipts = new OrchestrationCommandReceipts(database)
      const events = eventStore.append(pendingEvents)
      projectionPipeline.applyEvents(events)
      const result =
        command.type === 'project.create' || command.type === 'project.revive'
          ? registrationResult(command, this.readModel)
          : null
      const receipt = receipts.recordAccepted(
        command,
        eventStore.currentSequence(),
        result,
        fingerprint,
      )

      return {
        events,
        receipt,
        sequence: events.at(-1)?.sequence ?? eventStore.currentSequence(),
      }
    })
  }

  // Provider side effects consume the same committed event bus as other reactors.
  private subscribeProviderCommandReactor() {
    const reactor = this.providerCommandReactor
    if (!reactor) return

    this.domainEvents.subscribe({
      handleEvents: (events) => reactor.handleEvents(events),
      name: 'provider-command-reactor',
    })
  }

  private createDeletionReactor() {
    const reactor = new SessionDeletionReactor({
      attachmentsDir: this.attachmentsDir,
      database: this.database,
      providerService: this.providerService,
      getReadModel: () => this.readModel,
      dispatch: (command) => this.enqueue(command),
    })
    this.deletionReactor = reactor
    this.domainEvents.subscribe(reactor)
    this.reactors.register({
      name: reactor.name,
      drain: () => reactor.drain(),
      isIdle: () => reactor.isIdle(),
    })
  }

  private createDiscoveryReconciler() {
    if (!this.providerService || !this.registration) return
    this.discovery = new SessionDiscoveryReconciler({
      providerService: this.providerService,
      registration: this.registration,
      dispatch: (command) => this.enqueue(command),
      getReadModel: () => this.readModel,
    })
  }

  private async recover() {
    for (const session of this.readModel.sessions.values()) {
      if (session.deletedAt) continue
      await this.recoverRuntime(session)
    }
    await this.deletionReactor?.recover()
  }

  private async recoverRuntime(session: OrchestrationProjectedSession) {
    const turn = session.latestTurn
    const ambiguous =
      turn?.providerStartState === 'claimed' || turn?.providerStartState === 'adopted'
    const active =
      session.runtime && ['starting', 'running', 'waiting'].includes(session.runtime.status)
    if (!ambiguous && !active) return
    const runtimeEpoch = ambiguous ? turn.runtimeEpoch : session.runtime?.runtimeEpoch
    const observedSequence = ambiguous ? turn.providerStartSequence : session.runtimeSequence
    if (!runtimeEpoch || observedSequence === null) return

    let message =
      'The server restarted while this provider operation was in progress. The prompt was not resent.'
    try {
      if (await this.providerService?.hasRuntime({ sessionId: session.id })) {
        await this.providerService?.stopRuntime({ sessionId: session.id })
      }
    } catch (error) {
      message += ` Provider cleanup needs a retry: ${errorMessage(error)}`
    }
    await this.enqueue({
      type: 'session.runtime.recover',
      sessionId: session.id,
      ...(ambiguous ? { turnId: turn.turnId } : {}),
      observedSequence,
      runtimeEpoch,
      message,
      createdAt: new Date().toISOString(),
      commandId: v.parse(
        commandIdSchema,
        internalCommandKey('runtime-recovery', session.id, observedSequence, runtimeEpoch),
      ),
    })
  }

  private scheduleQueuedStarts() {
    if (!this.providerCommandReactor) return
    for (const session of this.readModel.sessions.values()) {
      const turn = session.latestTurn
      if (session.deletedAt || turn?.providerStartState !== 'queued') continue
      const events = this.eventStore.readAfter({
        afterSequence: turn.providerStartSequence - 1,
        limit: 1,
      })
      this.providerCommandReactor.handleEvents(events)
    }
  }

  private async requireNoLiveProviderForRevival(projectId: string, worktreeId: string) {
    const project = this.readModel.projects.get(projectId)
    const worktree = this.readModel.worktrees.get(worktreeId)
    if (!project?.deletedAt && !worktree?.retiredAt) return
    for (const session of this.readModel.sessions.values()) {
      if (!project?.deletedAt && session.worktreeId !== worktreeId) continue
      if (this.readModel.worktrees.get(session.worktreeId)?.projectId !== projectId) continue
      if (!(await this.providerService?.hasRuntime({ sessionId: session.id }))) continue
      throw sessionDomainErrors.REGISTRATION_BUSY({ projectId })
    }
  }

  // Capture the current branch and checkpoint before the provider touches the checkout.
  private async turnPrerequisitesSettled(sessionId: Parameters<typeof resolveSessionOwner>[1]) {
    if (this.registration) {
      const { worktree } = resolveSessionOwner(this.readModel, sessionId)
      const repository = (await this.registration.git.repo(worktree.path)).repository
      const branch = repository?.branch ?? null
      if (branch !== worktree.branch) {
        await this.enqueue({
          type: 'worktree.meta.update',
          worktreeId: worktree.id,
          branch,
          commandId: v.parse(
            commandIdSchema,
            internalCommandKey(
              'worktree-branch',
              worktree.id,
              this.readModel.sequence,
              branch ?? '',
            ),
          ),
          updatedAt: new Date().toISOString(),
        })
      }
    }
    await this.checkpointReactor?.drain()
  }

  // Deployments without Git have no checkpoint work to schedule.
  private subscribeCheckpointReactor(
    git: GitService | undefined,
    _providerService: ProviderService,
  ) {
    if (!git) return

    const checkpointReactor = new CheckpointReactor({
      dispatch: (command) => this.dispatch(command),
      getReadModel: () => this.readModel,
      git,
    })
    this.checkpointReactor = checkpointReactor
    this.domainEvents.subscribe(checkpointReactor)
    this.reactors.register({
      drain: () => checkpointReactor.drain(),
      isIdle: () => checkpointReactor.isIdle(),
      name: checkpointReactor.name,
    })
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
    const ingestion = new ProviderRuntimeIngestion(
      (command, source) => this.enqueueProviderCommand(command, source),
      {
        getReadModel: () => this.readModel,
        onLiveness: (sessionId) => providerService.markRuntimeSeen(sessionId),
      },
    )

    this.providerService = providerService
    this.subscribeCheckpointReactor(providerRuntimeOptions?.checkpointGit, providerService)

    const providerCommandReactor = new ProviderCommandReactor({
      beforeTurnStart: (sessionId) => this.turnPrerequisitesSettled(sessionId),
      checkpointGit: providerRuntimeOptions?.checkpointGit ?? null,
      dispatch: (command) => this.dispatch(command),
      getReadModel: () => this.readModel,
      ingestion,
      providerService,
    })
    this.reactors.register({
      drain: () => providerCommandReactor.drain(),
      isIdle: () => providerCommandReactor.isIdle(),
      name: 'provider-command-reactor',
    })

    return providerCommandReactor
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
  if (command.type !== 'session.turn.start') return { command }
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

function previouslyRejectedCommandError(
  receipt: NonNullable<ReturnType<OrchestrationCommandReceipts['find']>>,
) {
  return orchestrationErrors.COMMAND_PREVIOUSLY_REJECTED({
    commandId: receipt.commandId,
    internal: { storedError: receipt.error },
    message: receipt.error ?? undefined,
  })
}
