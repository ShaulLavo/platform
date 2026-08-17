import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrateOrchestrationDatabase } from '../../../db/migrations'
import * as schema from '../../../db/schema'
import { OrchestrationEventStore, type PendingOrchestrationEvent } from '../../event-store'
import { OrchestrationProjectionPipeline } from '../../projection-pipeline'
import { OrchestrationSnapshotQuery } from '../../snapshot-query'
import { createEmptyReadModel, type OrchestrationReadModel } from '../../read-model'

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
    // The aggregate follows the payload, exactly as the decider does it, so a
    // fixture can name a thread other than the default one.
    ...aggregate(payload),
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

function aggregate(payload: unknown) {
  const record = payload as { projectId?: string; threadId?: string }
  if (record.threadId) return { aggregateId: record.threadId, aggregateKind: 'thread' } as const

  return { aggregateId: record.projectId ?? PROJECT_ID, aggregateKind: 'project' } as const
}

/**
 * Drives the pipeline and the read-model cache exactly as the engine does: one
 * committed batch at a time, SQL first, then the cache refresh over the same
 * events. Tests that assert on the in-memory model must go through this and not
 * through a hand-rolled loop, or they stop testing the path production runs.
 */
export function applyIncrementally(
  fixture: ReturnType<typeof createProjectionFixture>,
  events: PendingOrchestrationEvent[],
): OrchestrationReadModel {
  let model = createEmptyReadModel()

  for (const pending of events) {
    const batch = fixture.append([pending])
    fixture.pipeline.applyEvents(batch)
    model = fixture.snapshots.refreshReadModel(model, batch)
  }

  return model
}

export function threadCreatedEvent(threadId: string, createdAt = '2026-05-24T00:00:00.000Z') {
  return pendingEvent(
    'thread.created',
    {
      branch: null,
      createdAt,
      interactionMode: 'default',
      modelSelection: { model: 'gpt-5-codex', providerInstanceId: 'codex' },
      projectId: PROJECT_ID,
      runtimeMode: 'full-access',
      threadId,
      title: 'Projection',
      updatedAt: createdAt,
      worktreePath: null,
    },
    createdAt,
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
    threadCreatedEvent(THREAD_ID, createdAt),
  ]
}

export function turnStartEventOnThread(
  threadId: string,
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
      threadId,
      turnId,
    },
    requestedAt,
  )
}

export function turnStartEvent(
  turnId: string,
  requestedAt: string,
  sourceProposedPlan?: { planId: string; threadId: string },
) {
  return turnStartEventOnThread(THREAD_ID, turnId, requestedAt, sourceProposedPlan)
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
