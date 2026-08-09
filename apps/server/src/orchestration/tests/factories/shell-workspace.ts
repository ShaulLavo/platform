import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrateOrchestrationDatabase } from '../../../db/migrations'
import * as schema from '../../../db/schema'
import type { PlatformDatabase } from '../../../db/client'
import { OrchestrationEventStore, type PendingOrchestrationEvent } from '../../event-store'
import { OrchestrationProjectionPipeline } from '../../projection-pipeline'
import { OrchestrationSnapshotQuery } from '../../snapshot-query'

export const WORKSPACE_PROJECT_ID = 'project-shell'

const CREATED_AT = '2026-05-24T00:00:00.000Z'

/**
 * A projected workspace with `threadCount` live threads, plus a read handle
 * that counts the queries a stream issues. Query counts are the only honest
 * assertion here: wall time on an in-memory SQLite is dominated by noise, while
 * "does a delta read the whole workspace" is exactly a count.
 */
export function createShellWorkspace(threadCount: number) {
  const sqlite = new Database(':memory:', { create: true })
  const database = drizzle({ client: sqlite, schema })
  migrateOrchestrationDatabase(database)

  const eventStore = new OrchestrationEventStore(database)
  const pipeline = new OrchestrationProjectionPipeline(database, eventStore)
  const counter = countingDatabase(database)
  const threadIds = Array.from({ length: threadCount }, (_, index) => `thread-${index}`)

  const seeded = eventStore.append([
    projectCreatedEvent(),
    ...threadIds.map((threadId) => threadCreatedEvent(threadId)),
    ...threadIds.map((threadId) => sessionSetEvent(threadId)),
  ])
  pipeline.applyEvents(seeded)

  return {
    close: () => sqlite.close(),
    countedDatabase: counter.database,
    database,
    eventStore,
    pipeline,
    resetQueryCount: counter.reset,
    queryCount: counter.count,
    snapshots: new OrchestrationSnapshotQuery(counter.database),
    threadIds,
    /** Appends, projects, and returns sequenced events ready to publish. */
    commit: (pending: PendingOrchestrationEvent[]) => {
      const events = eventStore.append(pending)
      pipeline.applyEvents(events)

      return events
    },
  }
}

export function assistantDeltaEvent(threadId: string, text: string, occurredAt = CREATED_AT) {
  return workspaceEvent(threadId, 'thread', 'thread.message-sent', {
    attachments: [],
    createdAt: occurredAt,
    messageId: `message-${threadId}`,
    role: 'assistant',
    streaming: true,
    text,
    threadId,
    turnId: null,
    updatedAt: occurredAt,
  })
}

export function threadDeletedEvent(threadId: string, occurredAt = CREATED_AT) {
  return workspaceEvent(threadId, 'thread', 'thread.deleted', {
    deletedAt: occurredAt,
    threadId,
  })
}

function projectCreatedEvent() {
  return workspaceEvent(WORKSPACE_PROJECT_ID, 'project', 'project.created', {
    createdAt: CREATED_AT,
    defaultModelSelection: null,
    projectId: WORKSPACE_PROJECT_ID,
    title: 'Shell',
    updatedAt: CREATED_AT,
    workspaceRoot: '/workspace',
  })
}

function threadCreatedEvent(threadId: string) {
  return workspaceEvent(threadId, 'thread', 'thread.created', {
    branch: null,
    createdAt: CREATED_AT,
    interactionMode: 'default',
    modelSelection: { model: 'gpt-5-codex', providerInstanceId: 'codex' },
    projectId: WORKSPACE_PROJECT_ID,
    runtimeMode: 'full-access',
    threadId,
    title: threadId,
    updatedAt: CREATED_AT,
    worktreePath: null,
  })
}

function sessionSetEvent(threadId: string) {
  return workspaceEvent(threadId, 'thread', 'thread.session-set', {
    session: {
      activeTurnId: null,
      lastError: null,
      providerInstanceId: 'codex',
      providerName: 'codex',
      providerSessionId: `provider-session-${threadId}`,
      runtimeMode: 'full-access',
      status: 'running',
      threadId,
      updatedAt: CREATED_AT,
    },
    threadId,
  })
}

function workspaceEvent(
  aggregateId: string,
  aggregateKind: 'project' | 'thread',
  type: string,
  payload: unknown,
  occurredAt = CREATED_AT,
) {
  return {
    actorKind: 'client',
    aggregateId,
    aggregateKind,
    causationEventId: null,
    commandId: null,
    correlationId: null,
    eventId: `event-${crypto.randomUUID()}`,
    metadata: {},
    occurredAt,
    payload,
    type,
  } as unknown as PendingOrchestrationEvent
}

/**
 * Counts `select()` calls, which is one-to-one with statements issued: drizzle
 * builds every read from `database.select()`.
 */
function countingDatabase(database: PlatformDatabase) {
  let selects = 0
  const proxy = new Proxy(database, {
    get(target, property) {
      if (property === 'select') selects += 1
      const value = Reflect.get(target, property) as unknown

      return typeof value === 'function' ? value.bind(target) : value
    },
  })

  return {
    count: () => selects,
    database: proxy as PlatformDatabase,
    reset: () => {
      selects = 0
    },
  }
}
