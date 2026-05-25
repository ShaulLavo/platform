import {
  orchestrationShellStreamItemSchema,
  orchestrationThreadStreamItemSchema,
  type OrchestrationEvent,
  type OrchestrationShellStreamItem,
  type OrchestrationThreadStreamItem,
} from './schemas'
import type { OrchestrationSnapshotQuery } from './snapshot-query'
import * as v from 'valibot'

export type OrchestrationStreamOptions = {
  afterSequence?: number
  signal?: AbortSignal
}

type EventSubscriber = {
  close: () => void
  publish: (events: OrchestrationEvent[]) => void
}

const DETAIL_EVENT_TYPES = new Set<OrchestrationEvent['type']>([
  'thread.message-sent',
  'thread.activity-appended',
  'thread.proposed-plan-upserted',
  'thread.turn-diff-completed',
  'thread.reverted',
  'thread.session-set',
])

export class OrchestrationStreamHub {
  private readonly subscribers = new Set<EventSubscriber>()

  publish(events: OrchestrationEvent[]) {
    if (events.length === 0) return

    for (const subscriber of this.subscribers) {
      subscriber.publish(events)
    }
  }

  subscribe(signal?: AbortSignal): AsyncGenerator<OrchestrationEvent[]> {
    const queue: OrchestrationEvent[][] = []
    const waiters: Array<(value: IteratorResult<OrchestrationEvent[]>) => void> = []
    let closed = false

    const subscriber: EventSubscriber = {
      close: () => {
        closed = true
        this.subscribers.delete(subscriber)
        while (waiters.length > 0) {
          waiters.shift()?.({ done: true, value: undefined })
        }
      },
      publish: (events) => {
        if (closed) return

        const waiter = waiters.shift()
        if (waiter) {
          waiter({ done: false, value: events })
          return
        }

        queue.push(events)
      },
    }

    this.subscribers.add(subscriber)
    signal?.addEventListener('abort', subscriber.close, { once: true })

    return eventBatchGenerator(subscriber, queue, waiters, signal)
  }
}

export class OrchestrationStreams {
  private readonly hub: OrchestrationStreamHub
  private readonly snapshots: OrchestrationSnapshotQuery

  constructor(snapshots: OrchestrationSnapshotQuery, hub = new OrchestrationStreamHub()) {
    this.hub = hub
    this.snapshots = snapshots
  }

  publish(events: OrchestrationEvent[]) {
    this.hub.publish(events)
  }

  async *shell(
    options: OrchestrationStreamOptions = {},
  ): AsyncGenerator<OrchestrationShellStreamItem> {
    const eventBatches = this.hub.subscribe(options.signal)
    const snapshot = this.snapshots.shellSnapshot()
    let sequence = Math.max(options.afterSequence ?? 0, snapshot.snapshotSequence)

    yield v.parse(orchestrationShellStreamItemSchema, {
      kind: 'snapshot',
      snapshot,
    })

    for await (const events of eventBatches) {
      const result = this.shellItemsAfter(events, sequence)
      sequence = result.sequence
      yield* result.items
    }
  }

  async *threadDetail(
    threadId: string,
    options: OrchestrationStreamOptions = {},
  ): AsyncGenerator<OrchestrationThreadStreamItem> {
    const eventBatches = this.hub.subscribe(options.signal)
    const snapshot = this.snapshots.threadDetailSnapshot(threadId)
    let sequence = Math.max(options.afterSequence ?? 0, snapshot.snapshotSequence)

    yield v.parse(orchestrationThreadStreamItemSchema, {
      kind: 'snapshot',
      snapshot,
    })

    for await (const events of eventBatches) {
      const result = detailItemsAfter(events, threadId, sequence)
      sequence = result.sequence
      yield* result.items
    }
  }

  private shellItemsAfter(events: OrchestrationEvent[], sequence: number) {
    const items: OrchestrationShellStreamItem[] = []
    let nextSequence = sequence

    for (const event of events) {
      if (event.sequence <= nextSequence) continue

      nextSequence = event.sequence
      const item = this.shellItemForEvent(event)
      if (item) items.push(item)
    }

    return { items, sequence: nextSequence }
  }

  private shellItemForEvent(event: OrchestrationEvent): OrchestrationShellStreamItem | null {
    if (event.type === 'project.deleted') {
      return v.parse(orchestrationShellStreamItemSchema, {
        kind: 'project-removed',
        projectId: event.payload.projectId,
        sequence: event.sequence,
      })
    }
    if (event.type === 'thread.deleted') {
      return v.parse(orchestrationShellStreamItemSchema, {
        kind: 'thread-removed',
        sequence: event.sequence,
        threadId: event.payload.threadId,
      })
    }
    if (event.aggregateKind === 'project') return this.projectUpsert(event)
    if (event.aggregateKind === 'thread') return this.threadUpsert(event)

    return null
  }

  private projectUpsert(event: OrchestrationEvent): OrchestrationShellStreamItem | null {
    const snapshot = this.snapshots.shellSnapshot()
    const project = snapshot.projects.find((candidate) => candidate.id === event.aggregateId)
    if (!project) return null

    return v.parse(orchestrationShellStreamItemSchema, {
      kind: 'project-upserted',
      project,
      sequence: event.sequence,
    })
  }

  private threadUpsert(event: OrchestrationEvent): OrchestrationShellStreamItem | null {
    const snapshot = this.snapshots.shellSnapshot()
    const thread = snapshot.threads.find((candidate) => candidate.id === event.aggregateId)
    if (!thread) return null

    return v.parse(orchestrationShellStreamItemSchema, {
      kind: 'thread-upserted',
      sequence: event.sequence,
      thread,
    })
  }
}

function detailItemsAfter(events: OrchestrationEvent[], threadId: string, sequence: number) {
  const items: OrchestrationThreadStreamItem[] = []
  let nextSequence = sequence

  for (const event of events) {
    if (event.sequence <= nextSequence) continue

    nextSequence = event.sequence
    if (!isDetailEventForThread(event, threadId)) continue

    items.push(
      v.parse(orchestrationThreadStreamItemSchema, {
        event,
        kind: 'event',
      }),
    )
  }

  return { items, sequence: nextSequence }
}

async function* eventBatchGenerator(
  subscriber: EventSubscriber,
  queue: OrchestrationEvent[][],
  waiters: Array<(value: IteratorResult<OrchestrationEvent[]>) => void>,
  signal?: AbortSignal,
): AsyncGenerator<OrchestrationEvent[]> {
  try {
    while (!signal?.aborted) {
      const next = queue.shift()
      if (next) {
        yield next
        continue
      }

      const result = await new Promise<IteratorResult<OrchestrationEvent[]>>((resolve) => {
        waiters.push(resolve)
      })
      if (result.done) return

      yield result.value
    }
  } finally {
    subscriber.close()
  }
}

function isDetailEventForThread(event: OrchestrationEvent, threadId: string) {
  if (event.aggregateKind !== 'thread') return false
  if (event.aggregateId !== threadId) return false

  return DETAIL_EVENT_TYPES.has(event.type)
}
