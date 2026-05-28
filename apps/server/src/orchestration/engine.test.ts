import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, it } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as v from 'valibot'
import {
  approvalRequestIdSchema,
  messageIdSchema,
  threadIdSchema,
  turnIdSchema,
} from '@workspace/contracts'
import { createApp } from '../app'
import * as schema from '../db/schema'
import { migrateOrchestrationDatabase } from '../db/migrations'
import { OrchestrationEventStore } from './event-store'
import type { PendingOrchestrationEvent } from './event-store'
import { OrchestrationEngine } from './engine'
import { OrchestrationProjectionPipeline } from './projection-pipeline'
import { ProviderCommandReactor } from './provider-command-reactor'
import { ProviderRuntimeIngestion } from './provider-runtime-ingestion'
import { projectEvents } from './projector'
import { createEmptyReadModel } from './read-model'
import { OrchestrationSnapshotQuery } from './snapshot-query'
import { MockProviderAdapter } from '../provider/adapters/mock'
import { ProviderRegistry } from '../provider/registry'
import { ProviderService } from '../provider/provider-service'
import { ProviderSessionDirectory } from '../provider/provider-session-directory'
import {
  orchestrationCommandSchema,
  type OrchestrationCommand,
  type OrchestrationEvent,
  type OrchestrationReplayEventsResult,
} from './schemas'

const now = '2026-05-24T00:00:00.000Z'
const later = '2026-05-24T00:01:00.000Z'
const assistantStarted = '2026-05-24T00:02:00.000Z'
const assistantCompleted = '2026-05-24T00:03:00.000Z'
const modelSelection = {
  providerInstanceId: 'codex',
  model: 'gpt-5-codex',
}
const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('orchestration engine', () => {
  it('dedupes commands by command receipt', async () => {
    const fixture = createFixture()
    const engine = new OrchestrationEngine(fixture.database)

    const first = await engine.dispatch(projectCreateCommand())
    const duplicate = await engine.dispatch(projectCreateCommand())
    const replay = engine.replay({ afterSequence: 0 })

    expect(first).toMatchObject({ deduped: false, sequence: 1 })
    expect(duplicate).toMatchObject({ deduped: true, sequence: 1 })
    expect(replay.events).toHaveLength(1)
    fixture.close()
  })

  it('rejects duplicate commands with previously rejected receipts', async () => {
    const fixture = createFixture()
    const engine = new OrchestrationEngine(fixture.database)

    await expect(engine.dispatch(threadCreateCommand())).rejects.toThrow('Project not found')
    await expect(engine.dispatch(threadCreateCommand())).rejects.toThrow('Project not found')

    expect(engine.replay({ afterSequence: 0 }).events).toHaveLength(0)
    fixture.close()
  })

  it('rolls back events and projections when command commit fails', async () => {
    const fixture = createFixture()
    fixture.sqlite.exec(`
      CREATE TRIGGER fail_projection_project_insert
      BEFORE INSERT ON projection_projects
      BEGIN
        SELECT RAISE(ABORT, 'projection failed');
      END;
    `)
    const engine = new OrchestrationEngine(fixture.database)

    await expect(
      engine.dispatch(
        projectCreateCommand({
          commandId: 'cmd-project-create-fails',
          projectId: 'project-fails',
        }),
      ),
    ).rejects.toThrow('projection failed')

    const receipts = fixture.database.select().from(schema.orchestrationCommandReceipts).all()

    expect(engine.replay({ afterSequence: 0 }).events).toHaveLength(0)
    expect(receipts).toMatchObject([
      {
        commandId: 'cmd-project-create-fails',
        resultSequence: null,
        status: 'rejected',
      },
    ])
    fixture.close()
  })

  it('projects replayed events into the same read model shape', async () => {
    const fixture = createFixture()
    const engine = new OrchestrationEngine(fixture.database)

    await dispatchFirstThread(engine)
    const replayed = engine.replay({ afterSequence: 0 }).events
    const model = projectEvents(replayed, createEmptyReadModel())
    const thread = model.threads.get('thread-1')

    expect(model.projects.get('project-1')?.title).toBe('Platform')
    expect(thread?.latestTurn?.turnId as string).toBe('turn-1')
    expect(thread?.messages[0]?.text).toBe('Build the first slice')
    fixture.close()
  })

  it('persists projection rows and returns shell/detail snapshots', async () => {
    const fixture = createFixture()
    const engine = new OrchestrationEngine(fixture.database)

    await dispatchFirstThread(engine)
    const shell = engine.shellSnapshot()
    const detail = engine.threadDetailSnapshot('thread-1')

    expect(shell.snapshotSequence).toBe(4)
    expect(shell.projects).toContainEqual(expect.objectContaining({ id: 'project-1' }))
    expect(shell.threads).toContainEqual(
      expect.objectContaining({
        id: 'thread-1',
        latestUserMessageAt: later,
        latestTurn: expect.objectContaining({ state: 'running', turnId: 'turn-1' }),
      }),
    )
    expect(detail.thread.messages).toContainEqual(
      expect.objectContaining({ id: 'message-1', role: 'user', text: 'Build the first slice' }),
    )
    fixture.close()
  })

  it('bootstraps a draft thread inside a turn-start command', async () => {
    const fixture = createFixture()
    const engine = new OrchestrationEngine(fixture.database)

    await engine.dispatch(projectCreateCommand())
    const result = await engine.dispatch(
      threadTurnStartCommand({
        bootstrapCreateThread: true,
        commandId: 'cmd-bootstrap-turn',
        threadId: 'thread-bootstrap',
      }),
    )
    const replay = engine.replay({ afterSequence: 0 })
    const detail = engine.threadDetailSnapshot('thread-bootstrap')

    expect(result).toMatchObject({ deduped: false, sequence: 4 })
    expect(replay.events.map((event) => event.type)).toEqual([
      'project.created',
      'thread.created',
      'thread.message-sent',
      'thread.turn-start-requested',
    ])
    expect(detail.thread.messages).toContainEqual(
      expect.objectContaining({ id: 'message-1', role: 'user', text: 'Build the first slice' }),
    )
    expect(detail.thread.latestTurn).toMatchObject({ state: 'running', turnId: 'turn-1' })
    fixture.close()
  })

  it('keeps shell snapshot timestamps stable when projection is unchanged', async () => {
    const fixture = createFixture()
    const engine = new OrchestrationEngine(fixture.database)

    const emptyFirst = engine.shellSnapshot()
    const emptySecond = engine.shellSnapshot()

    expect(emptySecond.updatedAt).toBe(emptyFirst.updatedAt)

    await engine.dispatch(projectCreateCommand())

    const projectedFirst = engine.shellSnapshot()
    const projectedSecond = engine.shellSnapshot()

    expect(projectedFirst.updatedAt).toBe(now)
    expect(projectedSecond.updatedAt).toBe(projectedFirst.updatedAt)
    fixture.close()
  })

  it('catches projections up after events were already appended', () => {
    const fixture = createFixture()
    const store = new OrchestrationEventStore(fixture.database)
    const project = store.append([
      {
        actorKind: 'client',
        aggregateId: 'project-1',
        aggregateKind: 'project',
        causationEventId: null,
        commandId: 'cmd-project-create',
        correlationId: 'cmd-project-create',
        eventId: 'event-project-created',
        metadata: {},
        occurredAt: now,
        payload: {
          createdAt: now,
          defaultModelSelection: null,
          projectId: 'project-1',
          title: 'Platform',
          updatedAt: now,
          workspaceRoot: '/workspace',
        },
        type: 'project.created',
      },
    ] as PendingOrchestrationEvent[])
    const snapshots = new OrchestrationSnapshotQuery(fixture.database)
    const staleSnapshot = snapshots.shellSnapshot()
    const pipeline = new OrchestrationProjectionPipeline(fixture.database, store)
    const applied = pipeline.catchUp()
    const snapshot = snapshots.shellSnapshot()

    expect(staleSnapshot.snapshotSequence).toBe(0)
    expect(applied).toHaveLength(1)
    expect(snapshot.snapshotSequence).toBe(project[0]!.sequence)
    expect(snapshot.projects[0]?.id as string).toBe('project-1')
    fixture.close()
  })

  it('settles assistant message completion in projections and the read model', async () => {
    const fixture = createFixture()
    const engine = new OrchestrationEngine(fixture.database)

    await dispatchFirstThread(engine)
    await engine.dispatch(assistantDeltaCommand())
    await engine.dispatch(assistantCompleteCommand())
    const detail = engine.threadDetailSnapshot('thread-1')
    const modelThread = engine.readModelSnapshot().threads.get('thread-1')
    const assistantMessage = detail.thread.messages.find((message) => message.id === 'message-2')

    expect(assistantMessage).toMatchObject({
      role: 'assistant',
      streaming: false,
      text: 'Done',
    })
    expect(detail.thread.latestTurn).toMatchObject({
      assistantMessageId: 'message-2',
      completedAt: assistantCompleted,
      state: 'completed',
      turnId: 'turn-1',
    })
    expect(modelThread?.latestTurn).toMatchObject({
      assistantMessageId: 'message-2',
      completedAt: assistantCompleted,
      state: 'completed',
    })
    fixture.close()
  })

  it('serves the Phase 2 HTTP command and snapshot flow', async () => {
    const fixture = createFixture()
    const root = await fixtureRoot()
    const app = createApp({
      auth: { allowedOrigins: ['http://localhost:5173'] },
      orchestration: { database: fixture.database },
      watch: false,
      workspaceRoot: root,
    })

    await postCommand(app, projectCreateCommand())
    await postCommand(app, threadCreateCommand())
    const turn = await postCommand(app, threadTurnStartCommand())
    const shell = await getJson<{ snapshotSequence: number }>(app, '/orchestration/shell-snapshot')
    const detail = await getJson<{ thread: { messages: Array<{ text: string }> } }>(
      app,
      '/orchestration/thread-detail?threadId=thread-1',
    )
    const replay = await postJson<OrchestrationReplayEventsResult>(app, '/orchestration/replay', {
      afterSequence: 0,
      threadId: 'thread-1',
    })

    expect(turn.sequence).toBe(4)
    expect(shell.snapshotSequence).toBe(4)
    expect(detail.thread.messages[0]?.text).toBe('Build the first slice')
    expect(replay.events.map((event) => event.type)).toEqual([
      'thread.created',
      'thread.message-sent',
      'thread.turn-start-requested',
    ])
    fixture.close()
  })

  it('streams an initial shell snapshot and live shell projection events', async () => {
    const fixture = createFixture()
    const root = await fixtureRoot()
    const app = createOrchestrationTestApp(root, fixture.database)
    const stream = await app.handle(
      new Request('http://local/orchestration/shell-stream', {
        headers: trustedHeaders(),
      }),
    )
    const events = createSseReader(stream)

    expect(await events.next()).toMatchObject({
      kind: 'snapshot',
      snapshot: { snapshotSequence: 0 },
    })

    const created = postCommand(app, projectCreateCommand())

    expect(await events.next()).toMatchObject({
      kind: 'project-upserted',
      project: { id: 'project-1', title: 'Platform' },
      sequence: 1,
    })
    await created
    await events.close()
    fixture.close()
  })

  it('streams detail events only for the subscribed thread', async () => {
    const fixture = createFixture()
    const root = await fixtureRoot()
    const app = createOrchestrationTestApp(root, fixture.database)

    await postCommand(app, projectCreateCommand())
    await postCommand(app, threadCreateCommand())
    await postCommand(app, threadCreateCommand('thread-2', 'cmd-thread-2-create'))

    const stream = await app.handle(
      new Request('http://local/orchestration/thread-detail-stream?threadId=thread-1', {
        headers: trustedHeaders(),
      }),
    )
    const events = createSseReader(stream)

    expect(await events.next()).toMatchObject({
      kind: 'snapshot',
      snapshot: { snapshotSequence: 3 },
    })

    await postCommand(
      app,
      threadTurnStartCommand({
        commandId: 'cmd-thread-2-turn',
        messageId: 'message-2',
        text: 'Ignore this thread',
        threadId: 'thread-2',
        turnId: 'turn-2',
      }),
    )
    const targetTurn = postCommand(app, threadTurnStartCommand())

    expect(await events.next()).toMatchObject({
      event: {
        payload: { messageId: 'message-1', text: 'Build the first slice', threadId: 'thread-1' },
        type: 'thread.message-sent',
      },
      kind: 'event',
    })
    expect(await events.next()).toMatchObject({
      event: {
        payload: { messageId: 'message-1', threadId: 'thread-1', turnId: 'turn-1' },
        type: 'thread.turn-start-requested',
      },
      kind: 'event',
    })
    await targetTurn
    await events.close()
    fixture.close()
  })

  it('serves provider snapshots through the provider registry route', async () => {
    const fixture = createFixture()
    const root = await fixtureRoot()
    const registry = new ProviderRegistry([new MockProviderAdapter()])
    const app = createApp({
      auth: { allowedOrigins: ['http://localhost:5173'] },
      orchestration: { database: fixture.database, providerRegistry: registry },
      watch: false,
      workspaceRoot: root,
    })

    const providers = await getJson<{ providers: Array<{ providerInstanceId: string }> }>(
      app,
      '/providers',
    )

    expect(providers.providers).toContainEqual(
      expect.objectContaining({ providerInstanceId: 'codex' }),
    )
    fixture.close()
  })

  it('starts a provider runtime turn and projects assistant output', async () => {
    const fixture = createFixture()
    const adapter = new MockProviderAdapter({ responseText: 'Runtime response' })
    const engine = createRuntimeEngine(fixture, adapter)

    await dispatchFirstThread(engine)
    await engine.providerRuntimeIdle()

    const runtime = fixture.database.select().from(schema.providerSessionRuntime).get()
    const detail = engine.threadDetailSnapshot('thread-1')

    expect(runtime).toMatchObject({
      providerDriverKind: 'codex',
      providerInstanceId: 'codex',
      status: 'running',
      threadId: 'thread-1',
    })
    expect(detail.thread.messages).toContainEqual(
      expect.objectContaining({
        role: 'assistant',
        streaming: false,
        text: 'Runtime response',
      }),
    )
    fixture.close()
  })

  it('dedupes duplicate provider runtime events before dispatch', async () => {
    const dispatched: OrchestrationCommand[] = []
    const ingestion = new ProviderRuntimeIngestion(async (command) => {
      dispatched.push(command)
    })

    await ingestion.ingest({
      createdAt: now,
      delta: 'one',
      eventId: 'runtime-event-1',
      messageId: v.parse(messageIdSchema, 'message-runtime'),
      threadId: v.parse(threadIdSchema, 'thread-1'),
      turnId: v.parse(turnIdSchema, 'turn-1'),
      type: 'assistant.delta',
    })
    await ingestion.ingest({
      createdAt: now,
      delta: 'one',
      eventId: 'runtime-event-1',
      messageId: v.parse(messageIdSchema, 'message-runtime'),
      threadId: v.parse(threadIdSchema, 'thread-1'),
      turnId: v.parse(turnIdSchema, 'turn-1'),
      type: 'assistant.delta',
    })
    await ingestion.ingest({
      completedAt: later,
      eventId: 'runtime-event-2',
      messageId: v.parse(messageIdSchema, 'message-runtime'),
      threadId: v.parse(threadIdSchema, 'thread-1'),
      turnId: v.parse(turnIdSchema, 'turn-1'),
      type: 'assistant.complete',
    })
    await ingestion.ingest({
      completedAt: later,
      eventId: 'runtime-event-2',
      messageId: v.parse(messageIdSchema, 'message-runtime'),
      threadId: v.parse(threadIdSchema, 'thread-1'),
      turnId: v.parse(turnIdSchema, 'turn-1'),
      type: 'assistant.complete',
    })

    expect(dispatched).toMatchObject([
      { delta: 'one', type: 'thread.message.assistant.delta' },
      { type: 'thread.message.assistant.complete' },
    ])
  })

  it('ingests runtime proposed plans into shell projection state', async () => {
    const fixture = createFixture()
    const engine = new OrchestrationEngine(fixture.database)
    const ingestion = new ProviderRuntimeIngestion(async (command) => {
      await engine.dispatch(command)
    })

    await dispatchFirstThread(engine)
    await ingestion.ingest({
      createdAt: assistantStarted,
      eventId: 'runtime-plan-1',
      planMarkdown: '1. Inspect runtime\n2. Patch provider',
      threadId: v.parse(threadIdSchema, 'thread-1'),
      turnId: v.parse(turnIdSchema, 'turn-1'),
      type: 'proposed-plan.upsert',
    })
    const shell = engine.shellSnapshot()

    expect(shell.threads[0]).toMatchObject({
      hasActionableProposedPlan: true,
      id: 'thread-1',
    })
    fixture.close()
  })

  it('projects provider failures onto session and turn state', async () => {
    const fixture = createFixture()
    const adapter = new MockProviderAdapter({ shouldFail: true })
    const engine = createRuntimeEngine(fixture, adapter)

    await dispatchFirstThread(engine)
    await engine.providerRuntimeIdle()
    const detail = engine.threadDetailSnapshot('thread-1')

    expect(detail.thread.latestTurn).toMatchObject({ state: 'error', turnId: 'turn-1' })
    expect(detail.thread.session).toMatchObject({
      lastError: 'Mock provider failed',
      status: 'error',
    })
    expect(detail.thread.activities).toContainEqual(
      expect.objectContaining({ kind: 'provider.turn.start.failed', tone: 'error' }),
    )
    fixture.close()
  })

  it('expires provider turn-start dedupe keys after the reactor TTL', async () => {
    const fixture = createFixture()
    const adapter = new MockProviderAdapter()
    const engine = new OrchestrationEngine(fixture.database)
    let nowMs = Date.parse(now)
    const reactor = createStandaloneProviderReactor(fixture, engine, adapter, () => nowMs)

    await dispatchFirstThread(engine)
    const event = firstTurnStartEvent(engine)
    reactor.handleEvents([event])
    await reactor.drain()
    reactor.handleEvents([event])
    await reactor.drain()
    nowMs += 31 * 60 * 1000
    reactor.handleEvents([event])
    await reactor.drain()

    expect(adapter.startedTurns).toHaveLength(2)
    fixture.close()
  })

  it('waits for in-flight provider actions when draining the runtime', async () => {
    let releaseProviderTurn = () => {}
    const providerTurnGate = new Promise<void>((resolve) => {
      releaseProviderTurn = resolve
    })
    const fixture = createFixture()
    const adapter = new MockProviderAdapter({ beforeComplete: () => providerTurnGate })
    const engine = createRuntimeEngine(fixture, adapter)
    let drained = false

    await dispatchFirstThread(engine)
    const idle = engine.providerRuntimeIdle().then(() => {
      drained = true
    })
    await Promise.resolve()

    expect(drained).toBe(false)
    releaseProviderTurn()
    await idle
    expect(drained).toBe(true)
    fixture.close()
  })

  it('routes interrupt requests to the active provider adapter', async () => {
    const fixture = createFixture()
    const adapter = new MockProviderAdapter()
    const engine = createRuntimeEngine(fixture, adapter)

    await dispatchFirstThread(engine)
    await engine.providerRuntimeIdle()
    await engine.dispatch(
      command({
        commandId: 'cmd-turn-interrupt',
        createdAt: assistantCompleted,
        threadId: 'thread-1',
        turnId: 'turn-1',
        type: 'thread.turn.interrupt',
      }),
    )
    await engine.providerRuntimeIdle()
    const detail = engine.threadDetailSnapshot('thread-1')

    expect(adapter.interruptedThreads).toContain(v.parse(threadIdSchema, 'thread-1'))
    expect(detail.thread.latestTurn).toMatchObject({ state: 'interrupted', turnId: 'turn-1' })
    expect(detail.thread.session).toMatchObject({ status: 'interrupted' })
    fixture.close()
  })

  it('projects interrupt and stop provider failures with operation-specific kinds', async () => {
    const interruptFixture = createFixture()
    const interruptAdapter = new MockProviderAdapter({ interruptError: 'interrupt failed' })
    const interruptEngine = createRuntimeEngine(interruptFixture, interruptAdapter)

    await dispatchFirstThread(interruptEngine)
    await interruptEngine.providerRuntimeIdle()
    await interruptEngine.dispatch(
      command({
        commandId: 'cmd-turn-interrupt',
        createdAt: assistantCompleted,
        threadId: 'thread-1',
        turnId: 'turn-1',
        type: 'thread.turn.interrupt',
      }),
    )
    await interruptEngine.providerRuntimeIdle()

    expect(interruptEngine.threadDetailSnapshot('thread-1').thread.activities).toContainEqual(
      expect.objectContaining({ kind: 'provider.turn.interrupt.failed', tone: 'error' }),
    )
    interruptFixture.close()

    const stopFixture = createFixture()
    const stopAdapter = new MockProviderAdapter({ stopError: 'stop failed' })
    const stopEngine = createRuntimeEngine(stopFixture, stopAdapter)

    await dispatchFirstThread(stopEngine)
    await stopEngine.providerRuntimeIdle()
    await stopEngine.dispatch(
      command({
        commandId: 'cmd-session-stop',
        createdAt: assistantCompleted,
        threadId: 'thread-1',
        type: 'thread.session.stop',
      }),
    )
    await stopEngine.providerRuntimeIdle()

    expect(stopEngine.threadDetailSnapshot('thread-1').thread.activities).toContainEqual(
      expect.objectContaining({ kind: 'provider.session.stop.failed', tone: 'error' }),
    )
    stopFixture.close()
  })

  it('routes approval and user-input responses to the active provider adapter', async () => {
    const fixture = createFixture()
    const adapter = new MockProviderAdapter()
    const engine = createRuntimeEngine(fixture, adapter)
    const threadId = v.parse(threadIdSchema, 'thread-1')
    const approvalRequestId = v.parse(approvalRequestIdSchema, 'approval-1')
    const userInputRequestId = v.parse(approvalRequestIdSchema, 'user-input-1')

    await dispatchFirstThread(engine)
    await engine.providerRuntimeIdle()
    await engine.dispatch(
      command({
        commandId: 'cmd-approval-respond',
        createdAt: assistantCompleted,
        decision: 'accept',
        requestId: approvalRequestId,
        threadId,
        type: 'thread.approval.respond',
      }),
    )
    await engine.dispatch(
      command({
        answers: { value: 'continue' },
        commandId: 'cmd-user-input-respond',
        createdAt: assistantCompleted,
        requestId: userInputRequestId,
        threadId,
        type: 'thread.user-input.respond',
      }),
    )
    await engine.providerRuntimeIdle()

    expect(adapter.approvalResponses).toContainEqual({
      decision: 'accept',
      requestId: approvalRequestId,
      threadId,
    })
    expect(adapter.userInputResponses).toContainEqual({
      answers: { value: 'continue' },
      requestId: userInputRequestId,
      threadId,
    })
    fixture.close()
  })

  it('projects stale approval and user-input responses as recoverable activities', async () => {
    const fixture = createFixture()
    const adapter = new MockProviderAdapter({
      approvalError: 'unknown pending approval request: approval-1',
      userInputError: 'unknown pending user-input request: user-input-1',
    })
    const engine = createRuntimeEngine(fixture, adapter)
    const threadId = v.parse(threadIdSchema, 'thread-1')
    const approvalRequestId = v.parse(approvalRequestIdSchema, 'approval-1')
    const userInputRequestId = v.parse(approvalRequestIdSchema, 'user-input-1')

    await dispatchFirstThread(engine)
    await engine.providerRuntimeIdle()
    await engine.dispatch(
      command({
        commandId: 'cmd-stale-approval-respond',
        createdAt: assistantCompleted,
        decision: 'accept',
        requestId: approvalRequestId,
        threadId,
        type: 'thread.approval.respond',
      }),
    )
    await engine.dispatch(
      command({
        answers: { value: 'continue' },
        commandId: 'cmd-stale-user-input-respond',
        createdAt: assistantCompleted,
        requestId: userInputRequestId,
        threadId,
        type: 'thread.user-input.respond',
      }),
    )
    await engine.providerRuntimeIdle()

    const activities = engine.threadDetailSnapshot('thread-1').thread.activities
    expect(activities).toContainEqual(
      expect.objectContaining({
        kind: 'provider.approval.respond.failed',
        payload: expect.objectContaining({
          detail: expect.stringContaining('Stale pending approval request: approval-1'),
        }),
      }),
    )
    expect(activities).toContainEqual(
      expect.objectContaining({
        kind: 'provider.user-input.respond.failed',
        payload: expect.objectContaining({
          detail: expect.stringContaining('Stale pending user-input request: user-input-1'),
        }),
      }),
    )
    fixture.close()
  })
})

async function dispatchFirstThread(engine: OrchestrationEngine) {
  await engine.dispatch(projectCreateCommand())
  await engine.dispatch(threadCreateCommand())
  await engine.dispatch(threadTurnStartCommand())
}

function projectCreateCommand(input: Partial<ProjectCreateFixture> = {}) {
  return command({
    commandId: input.commandId ?? 'cmd-project-create',
    createdAt: now,
    defaultModelSelection: null,
    projectId: input.projectId ?? 'project-1',
    title: 'Platform',
    type: 'project.create',
    workspaceRoot: '/workspace',
  })
}

type ProjectCreateFixture = {
  commandId: string
  projectId: string
}

function threadCreateCommand(threadId = 'thread-1', commandId = 'cmd-thread-create') {
  return command({
    branch: null,
    commandId,
    createdAt: now,
    interactionMode: 'default',
    modelSelection,
    projectId: 'project-1',
    runtimeMode: 'full-access',
    threadId,
    title: 'Phase 2',
    type: 'thread.create',
    worktreePath: null,
  })
}

function threadTurnStartCommand(input: Partial<ThreadTurnStartFixture> = {}) {
  return command({
    bootstrap: input.bootstrapCreateThread
      ? {
          createThread: {
            branch: null,
            createdAt: now,
            interactionMode: 'default',
            modelSelection,
            projectId: 'project-1',
            runtimeMode: 'full-access',
            title: 'Phase 2',
            worktreePath: null,
          },
        }
      : undefined,
    commandId: input.commandId ?? 'cmd-turn-start',
    createdAt: later,
    interactionMode: 'default',
    message: {
      messageId: input.messageId ?? 'message-1',
      role: 'user',
      text: input.text ?? 'Build the first slice',
    },
    runtimeMode: 'full-access',
    threadId: input.threadId ?? 'thread-1',
    turnId: input.turnId ?? 'turn-1',
    type: 'thread.turn.start',
  })
}

function assistantDeltaCommand() {
  return command({
    commandId: 'cmd-assistant-delta',
    createdAt: assistantStarted,
    delta: 'Done',
    messageId: 'message-2',
    threadId: 'thread-1',
    turnId: 'turn-1',
    type: 'thread.message.assistant.delta',
  })
}

function assistantCompleteCommand() {
  return command({
    commandId: 'cmd-assistant-complete',
    completedAt: assistantCompleted,
    messageId: 'message-2',
    threadId: 'thread-1',
    turnId: 'turn-1',
    type: 'thread.message.assistant.complete',
  })
}

type ThreadTurnStartFixture = {
  bootstrapCreateThread: boolean
  commandId: string
  messageId: string
  text: string
  threadId: string
  turnId: string
}

function command(value: unknown) {
  return v.parse(orchestrationCommandSchema, value) as OrchestrationCommand
}

function createFixture() {
  const sqlite = new Database(':memory:', { create: true })
  const database = drizzle({ client: sqlite, schema })
  migrateOrchestrationDatabase(database)

  return {
    close: () => sqlite.close(),
    database,
    sqlite,
  }
}

function createRuntimeEngine(
  fixture: ReturnType<typeof createFixture>,
  adapter: MockProviderAdapter,
) {
  return new OrchestrationEngine(fixture.database, {
    providerRuntime: { registry: new ProviderRegistry([adapter]) },
  })
}

function createStandaloneProviderReactor(
  fixture: ReturnType<typeof createFixture>,
  engine: OrchestrationEngine,
  adapter: MockProviderAdapter,
  now: () => number,
) {
  const providerService = new ProviderService({
    adapterRegistry: new ProviderRegistry([adapter]),
    sessionDirectory: new ProviderSessionDirectory(fixture.database),
  })
  const ingestion = new ProviderRuntimeIngestion(async (command) => {
    await engine.dispatch(command)
  })

  return new ProviderCommandReactor({
    getReadModel: () => engine.readModelSnapshot(),
    ingestion,
    now,
    providerService,
  })
}

function firstTurnStartEvent(engine: OrchestrationEngine) {
  const event = engine.replay({ afterSequence: 0 }).events.find(isThreadTurnStartRequestedEvent)
  if (!event) throw new Error('missing turn start event')

  return event
}

function isThreadTurnStartRequestedEvent(
  event: OrchestrationEvent,
): event is Extract<OrchestrationEvent, { type: 'thread.turn-start-requested' }> {
  return event.type === 'thread.turn-start-requested'
}

async function fixtureRoot() {
  const root = await mkdtemp(path.join(tmpdir(), 'platform-orchestration-'))
  await mkdir(root, { recursive: true })
  roots.push(root)

  return root
}

function createOrchestrationTestApp(
  root: string,
  database: ReturnType<typeof createFixture>['database'],
) {
  return createApp({
    auth: { allowedOrigins: ['http://localhost:5173'] },
    orchestration: { database },
    watch: false,
    workspaceRoot: root,
  })
}

async function postCommand(app: ReturnType<typeof createApp>, body: OrchestrationCommand) {
  return postJson<{ sequence: number }>(app, '/orchestration/commands', body)
}

async function postJson<T>(app: ReturnType<typeof createApp>, url: string, body: unknown) {
  const response = await app.handle(
    new Request(`http://local${url}`, {
      body: JSON.stringify(body),
      headers: trustedHeaders(),
      method: 'POST',
    }),
  )

  expect(response.status).toBe(200)

  return (await response.json()) as T
}

async function getJson<T>(app: ReturnType<typeof createApp>, url: string) {
  const response = await app.handle(
    new Request(`http://local${url}`, {
      headers: trustedHeaders(),
    }),
  )

  expect(response.status).toBe(200)

  return (await response.json()) as T
}

function trustedHeaders() {
  return {
    'content-type': 'application/json',
    origin: 'http://localhost:5173',
  }
}

function createSseReader(response: Response) {
  if (!response.body) throw new Error('missing event stream body')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffered = ''

  return {
    close: () => reader.cancel(),
    next: async () => {
      while (true) {
        const event = shiftSseEvent()
        if (event) return event

        const chunk = await reader.read()
        if (chunk.done) throw new Error('event stream ended')
        buffered += decodeSseChunk(decoder, chunk.value)
      }
    },
  }

  function shiftSseEvent() {
    const separator = buffered.indexOf('\n\n')
    if (separator < 0) return null

    const raw = buffered.slice(0, separator)
    buffered = buffered.slice(separator + 2)
    return parseSsePayload(raw)
  }
}

function decodeSseChunk(decoder: TextDecoder, value: unknown) {
  if (typeof value === 'string') return value

  return decoder.decode(value as BufferSource, { stream: true })
}

function parseSsePayload(raw: string) {
  const data = raw
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n')

  return JSON.parse(data) as Record<string, unknown>
}
