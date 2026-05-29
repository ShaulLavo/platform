import { and, asc, eq, gt, sql } from 'drizzle-orm'
import * as v from 'valibot'
import {
  orchestrationEventSchema,
  type OrchestrationAggregateKind,
  type OrchestrationEvent,
  type OrchestrationReplayEventsInput,
} from './schemas'
import { getDefaultPlatformDatabase, type PlatformDatabase } from '../db/client'
import { orchestrationEvents, type OrchestrationEventRow } from '../db/schema'
import {
  orchestrationEventBatchSummary,
  orchestrationReplaySummary,
  recordChatPipelineInfo,
} from './orchestration-logging'

export type OrchestrationDatabase = PlatformDatabase
export type PendingOrchestrationEvent = {
  [Type in OrchestrationEvent['type']]: Omit<
    Extract<OrchestrationEvent, { type: Type }>,
    'sequence'
  >
}[OrchestrationEvent['type']]

export class OrchestrationEventStore {
  private readonly database: OrchestrationDatabase

  constructor(database: OrchestrationDatabase = getDefaultPlatformDatabase()) {
    this.database = database
  }

  append(events: PendingOrchestrationEvent[]) {
    if (events.length === 0) return []

    recordChatPipelineInfo('chat.pipeline.event_store.append_start', {
      eventCount: events.length,
      eventTypes: events.map((event) => event.type),
    })
    const streamVersions = new Map<string, number>()
    const appended: OrchestrationEvent[] = []

    for (const event of events) {
      const streamVersion = nextStreamVersion(this.database, event, streamVersions)
      const inserted = this.database
        .insert(orchestrationEvents)
        .values({
          actorKind: event.actorKind,
          aggregateId: event.aggregateId,
          aggregateKind: event.aggregateKind,
          causationEventId: event.causationEventId,
          commandId: event.commandId,
          correlationId: event.correlationId,
          eventId: event.eventId,
          eventType: event.type,
          metadataJson: JSON.stringify(event.metadata),
          occurredAt: event.occurredAt,
          payloadJson: JSON.stringify(event.payload),
          streamVersion,
        })
        .returning({ sequence: orchestrationEvents.sequence })
        .get()

      appended.push(v.parse(orchestrationEventSchema, { ...event, sequence: inserted.sequence }))
    }

    recordChatPipelineInfo('chat.pipeline.event_store.append_complete', {
      ...orchestrationEventBatchSummary(appended),
    })
    return appended
  }

  currentSequence() {
    const row = this.database
      .select({ sequence: sql<number>`coalesce(max(${orchestrationEvents.sequence}), 0)` })
      .from(orchestrationEvents)
      .get()

    return row?.sequence ?? 0
  }

  readAfter(input: OrchestrationReplayEventsInput) {
    recordChatPipelineInfo('chat.pipeline.event_store.replay_start', orchestrationReplaySummary(input))
    const conditions = [gt(orchestrationEvents.sequence, input.afterSequence)]
    const aggregateFilter = aggregateConditions(input)

    if (aggregateFilter) conditions.push(aggregateFilter)

    const events = this.database
      .select()
      .from(orchestrationEvents)
      .where(and(...conditions))
      .orderBy(asc(orchestrationEvents.sequence))
      .all()
      .map(rowToEvent)

    recordChatPipelineInfo('chat.pipeline.event_store.replay_complete', {
      ...orchestrationReplaySummary(input),
      ...orchestrationEventBatchSummary(events),
    })

    return events
  }
}

function aggregateConditions(input: OrchestrationReplayEventsInput) {
  if (input.threadId) {
    return and(
      eq(orchestrationEvents.aggregateKind, 'thread'),
      eq(orchestrationEvents.aggregateId, input.threadId),
    )
  }
  if (!input.aggregateKind || !input.aggregateId) return undefined

  return and(
    eq(orchestrationEvents.aggregateKind, input.aggregateKind),
    eq(orchestrationEvents.aggregateId, input.aggregateId),
  )
}

function nextStreamVersion(
  database: OrchestrationDatabase,
  event: PendingOrchestrationEvent,
  streamVersions: Map<string, number>,
) {
  const key = streamKey(event.aggregateKind, event.aggregateId)
  const cached = streamVersions.get(key)

  if (cached !== undefined) {
    const next = cached + 1
    streamVersions.set(key, next)
    return next
  }

  const row = database
    .select({ version: sql<number>`coalesce(max(${orchestrationEvents.streamVersion}), 0)` })
    .from(orchestrationEvents)
    .where(
      and(
        eq(orchestrationEvents.aggregateKind, event.aggregateKind),
        eq(orchestrationEvents.aggregateId, event.aggregateId),
      ),
    )
    .get()
  const next = (row?.version ?? 0) + 1
  streamVersions.set(key, next)

  return next
}

function streamKey(kind: OrchestrationAggregateKind, id: string) {
  return `${kind}:${id}`
}

export function rowToEvent(row: OrchestrationEventRow) {
  return v.parse(orchestrationEventSchema, {
    actorKind: row.actorKind,
    aggregateId: row.aggregateId,
    aggregateKind: row.aggregateKind,
    causationEventId: row.causationEventId,
    commandId: row.commandId,
    correlationId: row.correlationId,
    eventId: row.eventId,
    metadata: JSON.parse(row.metadataJson) as unknown,
    occurredAt: row.occurredAt,
    payload: JSON.parse(row.payloadJson) as unknown,
    sequence: row.sequence,
    type: row.eventType,
  })
}
