import * as v from 'valibot'
import { migrateOrchestrationDatabase } from '../db/migrations'
import { orchestrationErrors } from '../observability'
import { clientOrchestrationCommandSchema, type OrchestrationCommand } from './schemas'
import { OrchestrationCommandReceipts } from './command-receipts'
import { decideOrchestrationCommand } from './decider'
import { OrchestrationEventStore, type OrchestrationDatabase } from './event-store'
import { OrchestrationProjectionPipeline } from './projection-pipeline'
import { ProviderCommandReactor } from './provider-command-reactor'
import { ProviderRuntimeIngestion } from './provider-runtime-ingestion'
import { createDefaultProviderRegistry, type ProviderRegistry } from '../provider/registry'
import { ProviderService } from '../provider/provider-service'
import { ProviderSessionDirectory } from '../provider/provider-session-directory'
import {
  orchestrationCommandSummary,
  orchestrationEventBatchSummary,
  recordChatPipelineInfo,
  recordChatPipelineWarning,
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
  providerRuntime?: boolean | { providerService?: ProviderService; registry?: ProviderRegistry }
}

export class OrchestrationEngine {
  private queue = Promise.resolve()
  private readonly database: OrchestrationDatabase
  private readonly receipts: OrchestrationCommandReceipts
  private readonly eventStore: OrchestrationEventStore
  private readonly projectionPipeline: OrchestrationProjectionPipeline
  private readonly providerCommandReactor: ProviderCommandReactor | null
  private readonly snapshotQuery: OrchestrationSnapshotQuery
  private readonly streams: OrchestrationStreams
  private readModel: OrchestrationReadModel

  constructor(database: OrchestrationDatabase, options: OrchestrationEngineOptions = {}) {
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

  dispatchClientCommand(command: unknown) {
    return this.dispatch(v.parse(clientOrchestrationCommandSchema, command))
  }

  dispatch(command: OrchestrationCommand) {
    recordChatPipelineInfo('chat.pipeline.command.queued', orchestrationCommandSummary(command))
    const task = this.queue.then(() => this.dispatchNow(command))
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

  private dispatchNow(command: OrchestrationCommand): OrchestrationDispatchResult {
    const startedAt = performance.now()
    recordChatPipelineInfo('chat.pipeline.command.start', orchestrationCommandSummary(command))

    const existing = this.receipts.find(command.commandId)
    if (existing) {
      if (existing.status === 'accepted') {
        recordChatPipelineInfo('chat.pipeline.command.deduped', {
          ...orchestrationCommandSummary(command),
          resultSequence: existing.resultSequence,
        })
        return dedupedDispatchResult(existing)
      }

      recordChatPipelineWarning('chat.pipeline.command.previously_rejected', {
        ...orchestrationCommandSummary(command),
        storedError: existing.error,
      })
      throw previouslyRejectedCommandError(existing)
    }

    const committed = this.commitNewCommand(command)
    recordChatPipelineInfo('chat.pipeline.command.committed', {
      ...orchestrationCommandSummary(command),
      ...orchestrationEventBatchSummary(committed.events),
      sequence: committed.sequence,
    })
    this.readModel = projectEvents(committed.events, this.readModel)
    recordChatPipelineInfo('chat.pipeline.read_model.projected', {
      ...orchestrationCommandSummary(command),
      ...orchestrationEventBatchSummary(committed.events),
    })
    this.streams.publish(committed.events)
    recordChatPipelineInfo('chat.pipeline.streams.published', {
      ...orchestrationCommandSummary(command),
      ...orchestrationEventBatchSummary(committed.events),
    })
    this.providerCommandReactor?.handleEvents(committed.events)
    recordChatPipelineInfo('chat.pipeline.provider_reactor.notified', {
      ...orchestrationCommandSummary(command),
      ...orchestrationEventBatchSummary(committed.events),
      enabled: this.providerCommandReactor !== null,
    })
    recordChatPipelineInfo('chat.pipeline.command.complete', {
      ...orchestrationCommandSummary(command),
      durationMs: elapsedMs(startedAt),
      sequence: committed.sequence,
    })

    return {
      deduped: false,
      receipt: committed.receipt,
      sequence: committed.sequence,
    }
  }

  private commitNewCommand(command: OrchestrationCommand) {
    try {
      const pendingEvents = decideOrchestrationCommand(command, this.readModel)
      recordChatPipelineInfo('chat.pipeline.command.decided', {
        ...orchestrationCommandSummary(command),
        eventCount: pendingEvents.length,
        eventTypes: pendingEvents.map((event) => event.type),
      })

      return this.commitCommand(command, pendingEvents)
    } catch (error) {
      this.receipts.recordRejected(command, error)
      recordChatPipelineWarning('chat.pipeline.command.rejected', {
        ...orchestrationCommandSummary(command),
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

    const registry =
      typeof options.providerRuntime === 'object' && options.providerRuntime.registry
        ? options.providerRuntime.registry
        : createDefaultProviderRegistry()
    const ingestion = new ProviderRuntimeIngestion((command) => this.dispatch(command))
    const providerService =
      typeof options.providerRuntime === 'object' && options.providerRuntime.providerService
        ? options.providerRuntime.providerService
        : new ProviderService({
            adapterRegistry: registry,
            sessionDirectory: new ProviderSessionDirectory(this.database),
          })

    return new ProviderCommandReactor({
      getReadModel: () => this.readModel,
      ingestion,
      providerService,
    })
  }
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
