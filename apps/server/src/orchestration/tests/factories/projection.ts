import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as v from 'valibot'
import { migrateOrchestrationDatabase } from '../../../db/migrations'
import * as schema from '../../../db/schema'
import { OrchestrationEventStore, type PendingOrchestrationEvent } from '../../event-store'
import { OrchestrationProjectionPipeline } from '../../projection-pipeline'
import { OrchestrationSnapshotQuery } from '../../snapshot-query'
import { orchestrationEventSchema, type OrchestrationEvent } from '../../schemas'

export const PROJECT_ID = 'project-1'
export const THREAD_ID = 'thread-1'

export function createProjectionFixture() {
  const sqlite = new Database(':memory:', { create: true })
  const database = drizzle({ client: sqlite, schema })
  migrateOrchestrationDatabase(database)
  const eventStore = new OrchestrationEventStore(database)

  return {
    close: () => sqlite.close(),
    database,
    eventStore,
    pipeline: new OrchestrationProjectionPipeline(database, eventStore),
    snapshots: new OrchestrationSnapshotQuery(database),
    /** Appends to the real event store and returns the sequenced events. */
    append: (events: PendingOrchestrationEvent[]) => eventStore.append(events),
  }
}

export function pendingEvent(
  type: PendingOrchestrationEvent['type'],
  payload: unknown,
  occurredAt = '2026-05-24T00:00:00.000Z',
) {
  const pending = {
    actorKind: 'client',
    aggregateId: type.startsWith('project.') ? PROJECT_ID : THREAD_ID,
    aggregateKind: type.startsWith('project.') ? 'project' : 'thread',
    causationEventId: null,
    commandId: null,
    correlationId: null,
    eventId: `event-${crypto.randomUUID()}`,
    metadata: {},
    occurredAt,
    payload,
    type,
  }

  return pending as PendingOrchestrationEvent
}

/** Stamps sequences for tests that drive the in-memory projector without SQL. */
export function withSequences(events: PendingOrchestrationEvent[]): OrchestrationEvent[] {
  return events.map((event, index) =>
    v.parse(orchestrationEventSchema, { ...event, sequence: index + 1 }),
  )
}

export function threadBootstrapEvents(createdAt = '2026-05-24T00:00:00.000Z') {
  return [
    pendingEvent(
      'project.created',
      {
        createdAt,
        defaultModelSelection: null,
        projectId: PROJECT_ID,
        title: 'Platform',
        updatedAt: createdAt,
        workspaceRoot: '/workspace',
      },
      createdAt,
    ),
    pendingEvent(
      'thread.created',
      {
        branch: null,
        createdAt,
        interactionMode: 'default',
        modelSelection: { model: 'gpt-5-codex', providerInstanceId: 'codex' },
        projectId: PROJECT_ID,
        runtimeMode: 'full-access',
        threadId: THREAD_ID,
        title: 'Projection',
        updatedAt: createdAt,
        worktreePath: null,
      },
      createdAt,
    ),
  ]
}

export function turnStartEvent(
  turnId: string,
  requestedAt: string,
  sourceProposedPlan?: { planId: string; threadId: string },
) {
  return pendingEvent(
    'thread.turn-start-requested',
    {
      createdAt: requestedAt,
      interactionMode: 'default',
      messageId: `message-user-${turnId}`,
      runtimeMode: 'full-access',
      sourceProposedPlan,
      threadId: THREAD_ID,
      turnId,
    },
    requestedAt,
  )
}

export function proposedPlanUpsertedEvent(input: {
  createdAt?: string
  implementedAt?: string | null
  implementationThreadId?: string | null
  planId: string
  planMarkdown: string
  turnId?: string | null
  updatedAt?: string
}) {
  const createdAt = input.createdAt ?? '2026-05-24T00:01:00.000Z'
  const updatedAt = input.updatedAt ?? createdAt

  return pendingEvent(
    'thread.proposed-plan-upserted',
    {
      proposedPlan: {
        createdAt,
        id: input.planId,
        implementationThreadId: input.implementationThreadId ?? null,
        implementedAt: input.implementedAt ?? null,
        planMarkdown: input.planMarkdown,
        threadId: THREAD_ID,
        turnId: input.turnId ?? null,
        updatedAt,
      },
      threadId: THREAD_ID,
    },
    updatedAt,
  )
}

export function turnDiffCompletedEvent(input: {
  assistantMessageId?: string | null
  checkpointRef?: string
  checkpointTurnCount: number
  completedAt?: string
  files?: Array<{ additions: number; deletions: number; kind: string; path: string }>
  status?: 'ready' | 'missing' | 'error'
  turnId: string
}) {
  const completedAt = input.completedAt ?? '2026-05-24T00:04:00.000Z'

  return pendingEvent(
    'thread.turn-diff-completed',
    {
      assistantMessageId: input.assistantMessageId ?? null,
      checkpointRef: input.checkpointRef ?? `refs/platform/${THREAD_ID}/${input.turnId}`,
      checkpointTurnCount: input.checkpointTurnCount,
      completedAt,
      files: input.files ?? [],
      status: input.status ?? 'ready',
      threadId: THREAD_ID,
      turnId: input.turnId,
    },
    completedAt,
  )
}

export function sessionSetEvent(
  session: Partial<{
    activeTurnId: string | null
    lastError: string | null
    status: string
    updatedAt: string
  }> = {},
) {
  const updatedAt = session.updatedAt ?? '2026-05-24T00:02:00.000Z'

  return pendingEvent(
    'thread.session-set',
    {
      session: {
        activeTurnId: session.activeTurnId ?? null,
        lastError: session.lastError ?? null,
        providerInstanceId: 'codex',
        providerName: 'codex',
        providerSessionId: 'provider-session-1',
        runtimeMode: 'full-access',
        status: session.status ?? 'running',
        threadId: THREAD_ID,
        updatedAt,
      },
      threadId: THREAD_ID,
    },
    updatedAt,
  )
}

export function messageSentEvent(input: {
  attachments?: unknown[]
  createdAt?: string
  messageId: string
  role?: 'assistant' | 'user'
  streaming: boolean
  text: string
  turnId?: string | null
  updatedAt?: string
}) {
  const createdAt = input.createdAt ?? '2026-05-24T00:01:00.000Z'
  const updatedAt = input.updatedAt ?? createdAt

  return pendingEvent(
    'thread.message-sent',
    {
      attachments: input.attachments ?? [],
      createdAt,
      messageId: input.messageId,
      role: input.role ?? 'assistant',
      streaming: input.streaming,
      text: input.text,
      threadId: THREAD_ID,
      turnId: input.turnId ?? null,
      updatedAt,
    },
    updatedAt,
  )
}

export function activityAppendedEvent(input: {
  createdAt?: string
  id: string
  kind?: string
  payload?: unknown
  summary?: string
  tone?: string
  turnId?: string | null
}) {
  const createdAt = input.createdAt ?? '2026-05-24T00:01:30.000Z'

  return pendingEvent(
    'thread.activity-appended',
    {
      activity: {
        createdAt,
        id: input.id,
        kind: input.kind ?? 'tool.started',
        payload: input.payload ?? null,
        summary: input.summary ?? 'Tool started',
        threadId: THREAD_ID,
        tone: input.tone ?? 'tool',
        turnId: input.turnId ?? null,
      },
      threadId: THREAD_ID,
    },
    createdAt,
  )
}
