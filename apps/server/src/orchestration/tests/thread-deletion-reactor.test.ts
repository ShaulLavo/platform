import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import type { WideEvent } from 'evlog'
import { readFsLogs } from 'evlog/fs'
import * as v from 'valibot'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CODEX_PROVIDER_SETTINGS, threadIdSchema } from '@workspace/contracts'
import { migrateOrchestrationDatabase } from '../../db/migrations'
import * as schema from '../../db/schema'
import {
  flushObservability,
  initializeObservability,
  resetObservabilityForTests,
} from '../../observability/runtime'
import { MockProviderAdapter } from '../../provider/adapters/mock'
import { ProviderAdapterRegistry } from '../../provider/provider-adapter-registry'
import { ProviderService } from '../../provider/provider-service'
import { ProviderSessionDirectory } from '../../provider/provider-session-directory'
import { OrchestrationEngine } from '../engine'
import { orchestrationCommandSchema, type OrchestrationCommand } from '../schemas'
import { ThreadDeletionReactor } from '../thread-deletion-reactor'

const CLEANUP_ACTION = 'chat.pipeline.thread_deletion_reactor.cleanup'
const now = '2026-05-24T00:00:00.000Z'
const later = '2026-05-24T00:01:00.000Z'
const modelSelection = {
  providerInstanceId: DEFAULT_CODEX_PROVIDER_SETTINGS.providerInstanceId,
  model: 'gpt-5-codex',
}
const roots: string[] = []

afterEach(async () => {
  await resetObservabilityForTests()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('thread deletion reactor', () => {
  it('stops the provider session bound to a deleted thread', async () => {
    const fixture = createFixture()
    const engine = new OrchestrationEngine(fixture.database)
    engine.subscribeDomainEvents(fixture.reactor)
    await startSession(fixture.providerService, 'thread-1')

    await engine.dispatch(projectCreateCommand())
    await engine.dispatch(threadCreateCommand())
    await engine.dispatch(threadDeleteCommand())
    await fixture.reactor.drain()

    expect(await fixture.adapter.hasSession({ threadId: threadId('thread-1') })).toBe(false)
    expect(fixture.providerService.listSessions()).toHaveLength(0)
    expect(fixture.database.select().from(schema.providerSessionRuntime).all()).toMatchObject([
      { status: 'stopped', threadId: 'thread-1' },
    ])
    fixture.close()
  })

  it('is a clean no-op for a deleted thread that never bound a session', async () => {
    const logDir = await fixtureRoot()
    initializeObservability(testObservabilityEnv(logDir))
    const fixture = createFixture()
    const engine = new OrchestrationEngine(fixture.database)
    engine.subscribeDomainEvents(fixture.reactor)

    await engine.dispatch(projectCreateCommand())
    await engine.dispatch(threadCreateCommand())
    const deleted = await engine.dispatch(threadDeleteCommand())
    await fixture.reactor.drain()

    expect(deleted).toMatchObject({ deduped: false })
    expect(fixture.adapter.interruptedThreads).toHaveLength(0)
    expect(fixture.database.select().from(schema.providerSessionRuntime).all()).toHaveLength(0)
    expect(await cleanupEvent(logDir)).toMatchObject({
      level: 'info',
      sessionStopped: false,
      skipReason: 'no-binding',
      threadId: 'thread-1',
    })
    fixture.close()
  })

  it('records a stop failure on the wide event without breaking the deletion', async () => {
    const logDir = await fixtureRoot()
    initializeObservability(testObservabilityEnv(logDir))
    const fixture = createFixture({ stopError: 'Mock provider refused to stop' })
    const engine = new OrchestrationEngine(fixture.database)
    engine.subscribeDomainEvents(fixture.reactor)
    await startSession(fixture.providerService, 'thread-1')

    await engine.dispatch(projectCreateCommand())
    await engine.dispatch(threadCreateCommand())
    const deleted = await engine.dispatch(threadDeleteCommand())
    await expect(fixture.reactor.drain()).resolves.toBeUndefined()

    expect(deleted).toMatchObject({ deduped: false })
    expect(engine.shellSnapshot().threads).toHaveLength(0)
    expect(engine.replay({ afterSequence: 0 }).events.map((event) => event.type)).toContain(
      'thread.deleted',
    )
    expect(await cleanupEvent(logDir)).toMatchObject({
      error: { message: 'Mock provider refused to stop' },
      level: 'warn',
      sessionStopped: false,
      threadId: 'thread-1',
    })
    fixture.close()
  })

  it('stops one session per thread when a project delete cascades', async () => {
    const fixture = createFixture()
    const engine = new OrchestrationEngine(fixture.database)
    engine.subscribeDomainEvents(fixture.reactor)
    await startSession(fixture.providerService, 'thread-1')
    await startSession(fixture.providerService, 'thread-2')

    await engine.dispatch(projectCreateCommand())
    await engine.dispatch(threadCreateCommand())
    await engine.dispatch(threadCreateCommand('thread-2', 'cmd-thread-create-2'))
    await engine.dispatch(projectDeleteCommand())
    await fixture.reactor.drain()

    expect(fixture.adapter.interruptedThreads).toEqual(['thread-1', 'thread-2'])
    expect(fixture.providerService.listSessions()).toHaveLength(0)
    fixture.close()
  })

  it('does not stop a second time when the same deletion is redelivered', async () => {
    const fixture = createFixture()
    const engine = new OrchestrationEngine(fixture.database)
    engine.subscribeDomainEvents(fixture.reactor)
    await startSession(fixture.providerService, 'thread-1')

    await engine.dispatch(projectCreateCommand())
    await engine.dispatch(threadCreateCommand())
    await engine.dispatch(threadDeleteCommand())
    await fixture.reactor.drain()
    fixture.reactor.handleEvents(engine.replay({ afterSequence: 0 }).events)
    await fixture.reactor.drain()

    expect(fixture.adapter.interruptedThreads).toEqual(['thread-1'])
    fixture.close()
  })

  it('stops the session of a thread deleted through the engine-wired runtime', async () => {
    const fixture = createFixture()
    const adapter = new MockProviderAdapter()
    const engine = new OrchestrationEngine(fixture.database, {
      providerRuntime: { adapterRegistry: new ProviderAdapterRegistry([adapter]) },
    })

    await engine.dispatch(projectCreateCommand())
    await engine.dispatch(threadCreateCommand())
    await engine.dispatch(threadTurnStartCommand())
    await engine.providerRuntimeIdle()

    expect(await adapter.hasSession({ threadId: threadId('thread-1') })).toBe(true)

    await engine.dispatch(threadDeleteCommand())

    await vi.waitFor(async () => {
      expect(await adapter.hasSession({ threadId: threadId('thread-1') })).toBe(false)
    })
    fixture.close()
  })
})

function createFixture(adapterOptions: ConstructorParameters<typeof MockProviderAdapter>[0] = {}) {
  const sqlite = new Database(':memory:', { create: true })
  const database = drizzle({ client: sqlite, schema })
  migrateOrchestrationDatabase(database)
  const adapter = new MockProviderAdapter(adapterOptions)
  const providerService = new ProviderService({
    adapterRegistry: new ProviderAdapterRegistry([adapter]),
    sessionDirectory: new ProviderSessionDirectory(database),
  })

  return {
    adapter,
    close: () => sqlite.close(),
    database,
    providerService,
    reactor: new ThreadDeletionReactor({ providerService }),
  }
}

function startSession(providerService: ProviderService, id: string) {
  return providerService.ensureSession({
    providerInstanceId: modelSelection.providerInstanceId,
    runtimeMode: 'full-access',
    runtimePayload: {
      cwd: '/workspace',
      interactionMode: 'default',
      modelSelection,
      runtimeMode: 'full-access',
    },
    threadId: threadId(id),
  })
}

function threadId(id: string) {
  return v.parse(threadIdSchema, id)
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

function projectDeleteCommand() {
  return command({
    commandId: 'cmd-project-delete',
    createdAt: later,
    force: true,
    projectId: 'project-1',
    type: 'project.delete',
  })
}

function threadCreateCommand(id = 'thread-1', commandId = 'cmd-thread-create') {
  return command({
    branch: null,
    commandId,
    createdAt: now,
    interactionMode: 'default',
    modelSelection,
    projectId: 'project-1',
    runtimeMode: 'full-access',
    threadId: id,
    title: 'Phase 2',
    type: 'thread.create',
    worktreePath: null,
  })
}

function threadDeleteCommand() {
  return command({
    commandId: 'cmd-thread-delete',
    createdAt: later,
    threadId: 'thread-1',
    type: 'thread.delete',
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
  return v.parse(orchestrationCommandSchema, value) as OrchestrationCommand
}

async function cleanupEvent(logDir: string) {
  await flushObservability()
  const events: WideEvent[] = []

  for await (const event of readFsLogs({ dir: logDir })) {
    events.push(event)
  }

  const cleanup = events.find((event) => event.action === CLEANUP_ACTION)
  expect(cleanup).toBeDefined()

  return cleanup as WideEvent & Record<string, unknown>
}

function testObservabilityEnv(logDir: string) {
  return {
    OBSERVABILITY_CONSOLE: 'false',
    OBSERVABILITY_DIR: logDir,
    OBSERVABILITY_ENABLED: 'true',
    OBSERVABILITY_INFO_SAMPLE_RATE: '100',
    NODE_ENV: 'production',
  }
}

async function fixtureRoot() {
  const root = await mkdtemp(path.join(tmpdir(), 'platform-thread-deletion-'))
  roots.push(root)

  return root
}
