import * as v from 'valibot'
import { migrateOrchestrationDatabase } from '../db/migrations'
import { clientOrchestrationCommandSchema, type OrchestrationCommand } from './schemas'
import { OrchestrationCommandReceipts } from './command-receipts'
import { decideOrchestrationCommand } from './decider'
import { OrchestrationEventStore, type OrchestrationDatabase } from './event-store'
import { OrchestrationProjectionPipeline } from './projection-pipeline'
import { projectEvents } from './projector'
import type { OrchestrationReadModel } from './read-model'
import { OrchestrationSnapshotQuery } from './snapshot-query'

export type OrchestrationDispatchResult = {
  deduped: boolean
  receipt: ReturnType<OrchestrationCommandReceipts['find']>
  sequence: number
}

export class OrchestrationEngine {
  private queue = Promise.resolve()
  private readonly receipts: OrchestrationCommandReceipts
  private readonly eventStore: OrchestrationEventStore
  private readonly projectionPipeline: OrchestrationProjectionPipeline
  private readonly snapshotQuery: OrchestrationSnapshotQuery
  private readModel: OrchestrationReadModel

  constructor(database: OrchestrationDatabase) {
    migrateOrchestrationDatabase(database)
    this.eventStore = new OrchestrationEventStore(database)
    this.receipts = new OrchestrationCommandReceipts(database)
    this.projectionPipeline = new OrchestrationProjectionPipeline(database, this.eventStore)
    this.snapshotQuery = new OrchestrationSnapshotQuery(database)
    this.projectionPipeline.catchUp()
    this.readModel = this.snapshotQuery.fullReadModel(this.eventStore.currentSequence())
  }

  dispatchClientCommand(command: unknown) {
    return this.dispatch(v.parse(clientOrchestrationCommandSchema, command))
  }

  dispatch(command: OrchestrationCommand) {
    const task = this.queue.then(() => this.dispatchNow(command))
    this.queue = task.then(noop, noop)

    return task
  }

  shellSnapshot() {
    return this.snapshotQuery.shellSnapshot(this.eventStore.currentSequence())
  }

  threadDetailSnapshot(threadId: string) {
    return this.snapshotQuery.threadDetailSnapshot(threadId, this.eventStore.currentSequence())
  }

  replay(input: Parameters<OrchestrationEventStore['readAfter']>[0]) {
    return { events: this.eventStore.readAfter(input) }
  }

  readModelSnapshot() {
    return this.readModel
  }

  private dispatchNow(command: OrchestrationCommand): OrchestrationDispatchResult {
    const existing = this.receipts.find(command.commandId)
    if (existing) {
      return {
        deduped: true,
        receipt: existing,
        sequence: existing.resultSequence ?? this.eventStore.currentSequence(),
      }
    }

    try {
      const pendingEvents = decideOrchestrationCommand(command, this.readModel)
      const events = this.eventStore.append(pendingEvents)
      this.projectionPipeline.applyEvents(events)
      this.readModel = projectEvents(events, this.readModel)
      const receipt = this.receipts.recordAccepted(command, events)

      return {
        deduped: false,
        receipt,
        sequence: events.at(-1)?.sequence ?? this.eventStore.currentSequence(),
      }
    } catch (error) {
      this.receipts.recordRejected(command, error)
      throw error
    }
  }
}

function noop() {}
