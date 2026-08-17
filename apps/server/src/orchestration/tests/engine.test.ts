import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as v from 'valibot'
import {
  approvalRequestIdSchema,
  messageIdSchema,
  threadIdSchema,
  turnIdSchema,
} from '@workspace/contracts'
import type { App } from '../../app'
import { closeTestApps, createTestApp } from '../../../test/server'
import * as schema from '../../db/schema'
import { migrateOrchestrationDatabase } from '../../db/migrations'
import { createWorkspacePaths } from '../../fs/path'
import { GitService } from '../../git/service'
import { OrchestrationEventStore } from '../event-store'
import type { PendingOrchestrationEvent } from '../event-store'
import { OrchestrationEngine } from '../engine'
import { OrchestrationProjectionPipeline } from '../projection-pipeline'
import { ProviderCommandReactor } from '../provider-command-reactor'
import { ProviderRuntimeIngestion } from '../provider-runtime-ingestion'
import { OrchestrationSnapshotQuery } from '../snapshot-query'
import { MockProviderAdapter } from '../../provider/adapters/mock'
import { ProviderAdapterRegistry } from '../../provider/provider-adapter-registry'
import { ProviderService } from '../../provider/provider-service'
import { ProviderSessionDirectory } from '../../provider/provider-session-directory'
import { checkpointRefForThreadTurn } from '../checkpoint-refs'
import {
  orchestrationCommandSchema,
  type OrchestrationCommand,
  type OrchestrationEvent,
  type OrchestrationReplayEventsResult,
} from '../schemas'
import { testSettingsOptions } from '../../settings/testing'

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
  await closeTestApps()
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
    // Both dispatch paths — fresh and deduped — return the wire contract and
    // nothing more. `toMatchObject` above would not notice a re-added field.
    expect([Object.keys(first).sort(), Object.keys(duplicate).sort()]).toEqual([
      ['deduped', 'sequence'],
      ['deduped', 'sequence'],
    ])
    expect(replay.events).toHaveLength(1)
    fixture.close()
  })

  it('writes a durable rejection for an invariant violation', async () => {
    const fixture = createFixture()
    const engine = new OrchestrationEngine(fixture.database)

    await expect(engine.dispatch(threadCreateCommand())).rejects.toThrow('Project not found')

    expect(fixture.database.select().from(schema.orchestrationCommandReceipts).all()).toMatchObject(
      [{ commandId: 'cmd-thread-create', resultSequence: null, status: 'rejected' }],
    )
    await expect(engine.dispatch(threadCreateCommand())).rejects.toMatchObject({
      code: 'orchestration.COMMAND_PREVIOUSLY_REJECTED',
    })
    expect(engine.replay({ afterSequence: 0 }).events).toHaveLength(0)
    fixture.close()
  })

  it('rolls back a failed commit without poisoning the command id', async () => {
    const fixture = createFixture()
    fixture.sqlite.exec(`
      CREATE TRIGGER fail_projection_project_insert
      BEFORE INSERT ON projection_projects
      BEGIN
        SELECT RAISE(ABORT, 'projection failed');
      END;
    `)
    const engine = new OrchestrationEngine(fixture.database)
    const retried = projectCreateCommand({
      commandId: 'cmd-project-create-retried',
      projectId: 'project-retried',
    })

    await expect(engine.dispatch(retried)).rejects.toThrow('projection failed')

    expect(engine.replay({ afterSequence: 0 }).events).toHaveLength(0)
    expect(fixture.database.select().from(schema.orchestrationCommandReceipts).all()).toHaveLength(
      0,
    )

    fixture.sqlite.exec('DROP TRIGGER fail_projection_project_insert')

    expect(await engine.dispatch(retried)).toMatchObject({ deduped: false, sequence: 1 })
    expect(fixture.database.select().from(schema.orchestrationCommandReceipts).all()).toMatchObject(
      [{ commandId: 'cmd-project-create-retried', status: 'accepted' }],
    )
    fixture.close()
  })

  it('fans committed events out to every reactor and isolates a throwing one', async () => {
    const fixture = createFixture()
    const engine = new OrchestrationEngine(fixture.database)
    const observed: OrchestrationEvent[] = []
    let throwingCalls = 0

    engine.subscribeDomainEvents({
      handleEvents: () => {
        throwingCalls += 1
        throw new Error('reactor exploded')
      },
      name: 'throwing',
    })
    const unsubscribe = engine.subscribeDomainEvents({
      handleEvents: (events) => observed.push(...events),
      name: 'observing',
    })

    const committed = await engine.dispatch(projectCreateCommand())
    unsubscribe()
    await engine.dispatch(threadCreateCommand())

    expect(committed).toMatchObject({ deduped: false, sequence: 1 })
    expect(throwingCalls).toBe(2)
    expect(observed.map((event) => event.type)).toEqual(['project.created'])
    expect(engine.replay({ afterSequence: 0 }).events).toHaveLength(2)
    fixture.close()
  })

  it('reconciles the read model from the event log after a failed dispatch', async () => {
    const fixture = createFixture()
    const engine = new OrchestrationEngine(fixture.database)
    const observed: OrchestrationEvent[] = []
    engine.subscribeDomainEvents({
      handleEvents: (events) => observed.push(...events),
      name: 'observing',
    })

    await engine.dispatch(projectCreateCommand())
    // A writer the engine never saw — the same drift a dispatch that throws
    // after its events are durable would leave behind.
    new OrchestrationEventStore(fixture.database).append([unobservedProjectCreatedEvent()])

    expect(engine.readModelSnapshot().projects.has('project-unobserved')).toBe(false)

    await expect(
      engine.dispatch(projectCreateCommand({ commandId: 'cmd-project-duplicate' })),
    ).rejects.toThrow('Project already exists')

    expect(engine.readModelSnapshot().projects.has('project-unobserved')).toBe(true)
    expect(observed.map((event) => event.type)).toEqual(['project.created', 'project.created'])
    fixture.close()
  })

  it('allocates stream_version inside the insert so an interleaved append cannot collide', () => {
    const fixture = createFixture()
    // Fires between the two batched appends below, claiming the version the old
    // pre-computed allocation would have handed to the second event.
    fixture.sqlite.exec(`
      CREATE TRIGGER interleave_competing_event
      AFTER INSERT ON orchestration_events
      WHEN new.aggregate_id = 'project-race'
      BEGIN
        INSERT INTO orchestration_events (
          event_id, aggregate_kind, aggregate_id, stream_version, event_type,
          occurred_at, command_id, causation_event_id, correlation_id, actor_kind,
          payload_json, metadata_json
        ) VALUES (
          'event-competing-' || new.sequence, 'project', 'project-race',
          (SELECT coalesce(max(stream_version), 0) + 1 FROM orchestration_events
            WHERE aggregate_kind = 'project' AND aggregate_id = 'project-race'),
          'project.deleted', new.occurred_at, NULL, NULL, NULL, 'server',
          new.payload_json, new.metadata_json
        );
      END;
    `)
    const store = new OrchestrationEventStore(fixture.database)

    const appended = store.append([raceEvent('event-race-1'), raceEvent('event-race-2')])
    const versions = fixture.database
      .select({ streamVersion: schema.orchestrationEvents.streamVersion })
      .from(schema.orchestrationEvents)
      .all()
      .map((row) => row.streamVersion)
      .sort((left, right) => left - right)

    expect(appended.map((event) => event.eventId as string)).toEqual([
      'event-race-1',
      'event-race-2',
    ])
    expect(versions).toEqual([1, 2, 3, 4])
    fixture.close()
  })

  it('rebuilds the same read model from the projection rows', async () => {
    const fixture = createFixture()
    const engine = new OrchestrationEngine(fixture.database)

    await dispatchFirstThread(engine)
    const rebuilt = new OrchestrationSnapshotQuery(fixture.database).fullReadModel()
    const thread = rebuilt.threads.get('thread-1')

    expect(rebuilt.projects.get('project-1')?.title).toBe('Platform')
    expect(thread?.latestTurn?.turnId as string).toBe('turn-1')
    expect(thread?.messages[0]?.text).toBe('Build the first slice')
    expect(thread).toEqual(engine.readModelSnapshot().threads.get('thread-1'))
    fixture.close()
  })

  it('reports malformed persisted event JSON as a structured invariant error', () => {
    const fixture = createFixture()
    const store = new OrchestrationEventStore(fixture.database)
    fixture.database
      .insert(schema.orchestrationEvents)
      .values({
        actorKind: 'client',
        aggregateId: 'project-1',
        aggregateKind: 'project',
        causationEventId: null,
        commandId: 'cmd-project-create',
        correlationId: 'cmd-project-create',
        eventId: 'event-project-created',
        eventType: 'project.created',
        metadataJson: '{',
        occurredAt: now,
        payloadJson: JSON.stringify({
          createdAt: now,
          defaultModelSelection: null,
          projectId: 'project-1',
          title: 'Platform',
          updatedAt: now,
          workspaceRoot: '/workspace',
        }),
        streamVersion: 1,
      })
      .run()

    try {
      store.readAfter({ afterSequence: 0 })
    } catch (error) {
      expect(error).toMatchObject({
        code: 'orchestration.EVENT_JSON_INVALID',
        internal: { field: 'metadataJson', sequence: 1 },
        message: 'Invalid orchestration event metadataJson JSON at sequence 1',
        status: 500,
      })
      fixture.close()
      return
    }

    fixture.close()
    throw new Error('expected malformed event JSON to throw')
  })

  it('persists projection rows and returns shell/detail snapshots', async () => {
    const fixture = createFixture()
    const engine = new OrchestrationEngine(fixture.database)

    await dispatchFirstThread(engine)
    const shell = engine.shellSnapshot()
    const detail = engine.threadDetailSnapshot('thread-1')

    expect(shell.snapshotSequence).toBe(4)
    expect(shell.projects).toContainEqual(expect.objectContaining({ id: 'project-1' }))
    const thread = shell.threads.find((candidate) => candidate.id === 'thread-1')

    expect(thread).toMatchObject({
      latestTurn: expect.objectContaining({ state: 'running', turnId: 'turn-1' }),
    })
    // One server clock reading per command, so the user message and the turn it
    // opened land on the same instant instead of on two client-supplied ones.
    expect(thread?.latestUserMessageAt).toBe(thread?.latestTurn?.requestedAt)
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

    expect(projectedFirst.updatedAt).not.toBe(emptyFirst.updatedAt)
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
    const app = createTestApp({
      auth: { allowedOrigins: ['http://localhost:5173'] },
      orchestration: { database: fixture.database },
      settings: testSettingsOptions(root),
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
    expect(await events.next()).toMatchObject({ kind: 'synchronized', sequence: 0 })

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
    expect(await events.next()).toMatchObject({ kind: 'synchronized', sequence: 3 })

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

  it('serves provider snapshots through the provider adapter registry route', async () => {
    const fixture = createFixture()
    const root = await fixtureRoot()
    const adapterRegistry = new ProviderAdapterRegistry([new MockProviderAdapter()])
    const app = createTestApp({
      auth: { allowedOrigins: ['http://localhost:5173'] },
      orchestration: { database: fixture.database, providerAdapterRegistry: adapterRegistry },
      settings: testSettingsOptions(root),
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
      status: 'ready',
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

  it('restores checkpoint refs and emits reverted after provider rollback', async () => {
    const fixture = createFixture()
    const root = await fixtureRoot()
    await initGitRepository(root)
    // The agent's edit lands inside the turn, so the ref `CheckpointReactor`
    // captures when the turn settles is that turn's own result.
    let turnFileContent = 'one\n'
    const adapter = new MockProviderAdapter({
      beforeComplete: () => writeFile(path.join(root, 'app.txt'), turnFileContent),
    })
    const engine = new OrchestrationEngine(fixture.database, {
      providerRuntime: {
        checkpointGit: new GitService(createWorkspacePaths(root)),
        adapterRegistry: new ProviderAdapterRegistry([adapter]),
      },
    })
    const turnTwoRef = checkpointRefForThreadTurn('thread-1', 2)

    await commitFile(root, 'base\n', 'base commit')
    await dispatchCheckpointRuntimeThread(engine, root, () => {
      turnFileContent = 'two\n'
    })

    await engine.dispatch(
      command({
        commandId: 'cmd-checkpoint-revert',
        createdAt: assistantCompleted,
        threadId: 'thread-1',
        turnCount: 1,
        type: 'thread.checkpoint.revert',
      }),
    )
    await engine.providerRuntimeIdle()

    const events = engine.replay({ afterSequence: 0 }).events
    const detail = engine.threadDetailSnapshot('thread-1')

    expect(events.map((event) => event.type)).toContain('thread.checkpoint-revert-requested')
    expect(events.at(-1)).toMatchObject({
      payload: { threadId: 'thread-1', turnCount: 1 },
      type: 'thread.reverted',
    })
    expect(await readFile(path.join(root, 'app.txt'), 'utf8')).toBe('one\n')
    expect(await gitRefExists(root, turnTwoRef)).toBe(false)
    expect(adapter.rollbacks).toContainEqual({
      numTurns: 1,
      threadId: v.parse(threadIdSchema, 'thread-1'),
    })
    expect(detail.thread.messages.map((message) => message.turnId)).not.toContain('turn-2')
    expect(
      Object.keys(engine.readModelSnapshot().threads.get('thread-1')?.checkpointByTurnId ?? {}),
    ).toEqual(['turn-1'])
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

async function dispatchCheckpointRuntimeThread(
  engine: OrchestrationEngine,
  workspaceRoot: string,
  beforeSecondTurn: () => void,
) {
  await engine.dispatch(projectCreateCommand({ workspaceRoot }))
  await engine.dispatch(
    threadCreateCommand('thread-1', 'cmd-thread-create-checkpoint', workspaceRoot),
  )
  await engine.dispatch(threadTurnStartCommand())
  await engine.providerRuntimeIdle()
  beforeSecondTurn()
  await engine.dispatch(
    threadTurnStartCommand({
      commandId: 'cmd-turn-2-start',
      messageId: 'message-turn-2',
      text: 'Second turn',
      turnId: 'turn-2',
    }),
  )
  await engine.providerRuntimeIdle()
}

function projectCreateCommand(input: Partial<ProjectCreateFixture> = {}) {
  return command({
    commandId: input.commandId ?? 'cmd-project-create',
    createdAt: now,
    defaultModelSelection: null,
    projectId: input.projectId ?? 'project-1',
    title: 'Platform',
    type: 'project.create',
    workspaceRoot: input.workspaceRoot ?? '/workspace',
  })
}

type ProjectCreateFixture = {
  commandId: string
  projectId: string
  workspaceRoot: string
}

function unobservedProjectCreatedEvent() {
  return {
    actorKind: 'client',
    aggregateId: 'project-unobserved',
    aggregateKind: 'project',
    causationEventId: null,
    commandId: 'cmd-project-unobserved',
    correlationId: 'cmd-project-unobserved',
    eventId: 'event-project-unobserved',
    metadata: {},
    occurredAt: now,
    payload: {
      createdAt: now,
      defaultModelSelection: null,
      projectId: 'project-unobserved',
      title: 'Unobserved',
      updatedAt: now,
      workspaceRoot: '/workspace',
    },
    type: 'project.created',
  } as PendingOrchestrationEvent
}

function raceEvent(eventId: string) {
  return {
    actorKind: 'client',
    aggregateId: 'project-race',
    aggregateKind: 'project',
    causationEventId: null,
    commandId: 'cmd-project-race',
    correlationId: 'cmd-project-race',
    eventId,
    metadata: {},
    occurredAt: now,
    payload: { deletedAt: now, projectId: 'project-race' },
    type: 'project.deleted',
  } as PendingOrchestrationEvent
}

function threadCreateCommand(
  threadId = 'thread-1',
  commandId = 'cmd-thread-create',
  worktreePath: string | null = null,
) {
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
    worktreePath,
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
    providerRuntime: { adapterRegistry: new ProviderAdapterRegistry([adapter]) },
  })
}

function createStandaloneProviderReactor(
  fixture: ReturnType<typeof createFixture>,
  engine: OrchestrationEngine,
  adapter: MockProviderAdapter,
  now: () => number,
) {
  const providerService = new ProviderService({
    adapterRegistry: new ProviderAdapterRegistry([adapter]),
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

async function initGitRepository(root: string) {
  await runGit(root, ['init'])
  await runGit(root, ['config', 'user.email', 'test@example.com'])
  await runGit(root, ['config', 'user.name', 'Test User'])
}

async function commitFile(root: string, content: string, message: string) {
  await writeFile(path.join(root, 'app.txt'), content)
  await runGit(root, ['add', 'app.txt'])
  await runGit(root, ['commit', '-m', message])
}

async function gitRefExists(root: string, ref: string) {
  const result = await runGit(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], true)

  return result.exitCode === 0
}

async function runGit(root: string, args: readonly string[], allowFailure = false) {
  const process = Bun.spawn(['git', '-C', root].concat(args), {
    stderr: 'pipe',
    stdout: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ])
  if (allowFailure || exitCode === 0) return { exitCode, stderr, stdout }

  throw new Error(`${stderr}${stdout}`.trim())
}

function createOrchestrationTestApp(
  root: string,
  database: ReturnType<typeof createFixture>['database'],
) {
  return createTestApp({
    auth: { allowedOrigins: ['http://localhost:5173'] },
    orchestration: { database },
    settings: testSettingsOptions(root),
    watch: false,
    workspaceRoot: root,
  })
}

async function postCommand(app: App, body: OrchestrationCommand) {
  return postJson<{ sequence: number }>(app, '/orchestration/commands', body)
}

async function postJson<T>(app: App, url: string, body: unknown) {
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

async function getJson<T>(app: App, url: string) {
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
