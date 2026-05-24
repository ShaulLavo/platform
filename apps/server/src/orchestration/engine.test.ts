import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, it } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as v from 'valibot'
import { createApp } from '../app'
import * as schema from '../db/schema'
import { migrateOrchestrationDatabase } from '../db/migrations'
import { OrchestrationEventStore } from './event-store'
import type { PendingOrchestrationEvent } from './event-store'
import { OrchestrationEngine } from './engine'
import { OrchestrationProjectionPipeline } from './projection-pipeline'
import { projectEvents } from './projector'
import { createEmptyReadModel } from './read-model'
import { OrchestrationSnapshotQuery } from './snapshot-query'
import {
  clientOrchestrationCommandSchema,
  type OrchestrationCommand,
  type OrchestrationReplayEventsResult,
} from './schemas'

const now = '2026-05-24T00:00:00.000Z'
const later = '2026-05-24T00:01:00.000Z'
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
    const pipeline = new OrchestrationProjectionPipeline(fixture.database, store)
    const applied = pipeline.catchUp()
    const snapshot = new OrchestrationSnapshotQuery(fixture.database).shellSnapshot(
      project[0]!.sequence,
    )

    expect(applied).toHaveLength(1)
    expect(snapshot.projects[0]?.id as string).toBe('project-1')
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
})

async function dispatchFirstThread(engine: OrchestrationEngine) {
  await engine.dispatch(projectCreateCommand())
  await engine.dispatch(threadCreateCommand())
  await engine.dispatch(threadTurnStartCommand())
}

function projectCreateCommand() {
  return command({
    commandId: 'cmd-project-create',
    createdAt: now,
    defaultModelSelection: null,
    projectId: 'project-1',
    title: 'Platform',
    type: 'project.create',
    workspaceRoot: '/workspace',
  })
}

function threadCreateCommand() {
  return command({
    branch: null,
    commandId: 'cmd-thread-create',
    createdAt: now,
    interactionMode: 'default',
    modelSelection,
    projectId: 'project-1',
    runtimeMode: 'full-access',
    threadId: 'thread-1',
    title: 'Phase 2',
    type: 'thread.create',
    worktreePath: null,
  })
}

function threadTurnStartCommand() {
  return command({
    commandId: 'cmd-turn-start',
    createdAt: later,
    interactionMode: 'default',
    message: {
      messageId: 'message-1',
      role: 'user',
      text: 'Build the first slice',
    },
    runtimeMode: 'full-access',
    threadId: 'thread-1',
    turnId: 'turn-1',
    type: 'thread.turn.start',
  })
}

function command(value: unknown) {
  return v.parse(clientOrchestrationCommandSchema, value) as OrchestrationCommand
}

function createFixture() {
  const sqlite = new Database(':memory:', { create: true })
  const database = drizzle({ client: sqlite, schema })
  migrateOrchestrationDatabase(database)

  return {
    close: () => sqlite.close(),
    database,
  }
}

async function fixtureRoot() {
  const root = await mkdtemp(path.join(tmpdir(), 'platform-orchestration-'))
  await mkdir(root, { recursive: true })
  roots.push(root)

  return root
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
