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
import { OrchestrationStreams, type OrchestrationStreamOptions } from './streams'

export type OrchestrationDispatchResult = {
  deduped: boolean
  receipt: ReturnType<OrchestrationCommandReceipts['find']>
  sequence: number
}

export class OrchestrationEngine {
  private queue = Promise.resolve()
  private readonly database: OrchestrationDatabase
  private readonly receipts: OrchestrationCommandReceipts
  private readonly eventStore: OrchestrationEventStore
  private readonly projectionPipeline: OrchestrationProjectionPipeline
  private readonly snapshotQuery: OrchestrationSnapshotQuery
  private readonly streams: OrchestrationStreams
  private readModel: OrchestrationReadModel

  constructor(database: OrchestrationDatabase) {
    this.database = database
    migrateOrchestrationDatabase(database)
    this.eventStore = new OrchestrationEventStore(database)
    this.receipts = new OrchestrationCommandReceipts(database)
    this.projectionPipeline = new OrchestrationProjectionPipeline(database, this.eventStore)
    this.snapshotQuery = new OrchestrationSnapshotQuery(database)
    this.streams = new OrchestrationStreams(this.snapshotQuery)
    this.projectionPipeline.catchUp()
    this.readModel = this.snapshotQuery.fullReadModel()
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

  private dispatchNow(command: OrchestrationCommand): OrchestrationDispatchResult {
    const existing = this.receipts.find(command.commandId)
    if (existing) {
      if (existing.status === 'accepted') return dedupedDispatchResult(existing)

      throw previouslyRejectedCommandError(existing)
    }

    const committed = this.commitNewCommand(command)
    this.readModel = projectEvents(committed.events, this.readModel)
    this.streams.publish(committed.events)

    return {
      deduped: false,
      receipt: committed.receipt,
      sequence: committed.sequence,
    }
  }

  private commitNewCommand(command: OrchestrationCommand) {
    try {
      const pendingEvents = decideOrchestrationCommand(command, this.readModel)

      return this.commitCommand(command, pendingEvents)
    } catch (error) {
      this.receipts.recordRejected(command, error)
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
}

function noop() {}

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
  return new Error(receipt.error ?? `Command previously rejected: ${receipt.commandId}`)
}
