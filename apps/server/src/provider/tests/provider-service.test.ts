import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Database } from 'bun:sqlite'
import { describe, expect, it } from 'vitest'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as v from 'valibot'
import {
  DEFAULT_INTERACTION_MODE,
  DEFAULT_PROVIDER_INSTANCE_ID,
  DEFAULT_RUNTIME_MODE,
  projectIdSchema,
  providerInstanceIdSchema,
  threadIdSchema,
  turnIdSchema,
} from '@workspace/contracts'
import { migrateOrchestrationDatabase } from '../../db/migrations'
import * as schema from '../../db/schema'
import { MockProviderAdapter } from '../adapters/mock'
import { MOCK_DRIVER_KIND, mockDriver } from '../drivers/mock'
import { ProviderAdapterRegistry } from '../provider-adapter-registry'
import { ProviderService } from '../provider-service'
import { ProviderSessionDirectory } from '../provider-session-directory'
import type { ProviderRuntimeEvent, ProviderTurnInput } from '../types'

describe('ProviderService', () => {
  it('reuses compatible session bindings and resets incompatible ones', async () => {
    const fixture = createFixture()
    const adapter = new MockProviderAdapter()
    const service = new ProviderService({
      adapterRegistry: new ProviderAdapterRegistry([adapter]),
      sessionDirectory: new ProviderSessionDirectory(fixture.database),
    })
    const input = providerTurnInput()
    const first = await service.ensureSession({
      providerInstanceId: input.providerInstanceId,
      runtimeMode: input.runtimeMode,
      runtimePayload: providerSessionPayload(input),
      threadId: input.thread.id,
    })
    const reused = await service.ensureSession({
      providerInstanceId: input.providerInstanceId,
      runtimeMode: input.runtimeMode,
      runtimePayload: { ...providerSessionPayload(input), activeTurnId: input.turnId },
      threadId: input.thread.id,
    })
    const reset = await service.ensureSession({
      providerInstanceId: input.providerInstanceId,
      runtimeMode: input.runtimeMode,
      runtimePayload: {
        ...providerSessionPayload(input),
        cwd: '/other-workspace',
      },
      threadId: input.thread.id,
    })

    expect(first).toMatchObject({ reused: false })
    expect(reused).toMatchObject({ reused: true })
    expect(reset).toMatchObject({
      binding: { runtimePayload: expect.objectContaining({ cwd: '/other-workspace' }) },
      reused: false,
    })
    fixture.close()
  })

  it('carries the resume cursor across a mid-conversation model switch', async () => {
    const fixture = createFixture()
    const adapter = new MockProviderAdapter()
    const service = new ProviderService({
      adapterRegistry: new ProviderAdapterRegistry([adapter]),
      sessionDirectory: new ProviderSessionDirectory(fixture.database),
    })
    const input = providerTurnInput()
    const started = await service.ensureSession({
      providerInstanceId: input.providerInstanceId,
      runtimeMode: input.runtimeMode,
      runtimePayload: providerSessionPayload(input),
      threadId: input.thread.id,
    })
    const switched = await service.ensureSession({
      providerInstanceId: input.providerInstanceId,
      runtimeMode: input.runtimeMode,
      runtimePayload: {
        ...providerSessionPayload(input),
        modelSelection: { ...input.modelSelection, model: 'gpt-5.5' },
      },
      threadId: input.thread.id,
    })

    expect(started.binding.resumeCursor).toBe('mock-thread:thread-1')
    expect(switched).toMatchObject({ reused: false })
    // The session restarts, the conversation does not.
    expect(adapter.startedSessions.map((session) => session.resumeCursor)).toEqual([
      null,
      'mock-thread:thread-1',
    ])
    expect(switched.binding.resumeCursor).toBe('mock-thread:thread-1')
    fixture.close()
  })

  it('hands a turn the cursor of the conversation it continues', async () => {
    const fixture = createFixture()
    const adapter = new MockProviderAdapter()
    const directory = new ProviderSessionDirectory(fixture.database)
    const service = new ProviderService({
      adapterRegistry: new ProviderAdapterRegistry([adapter]),
      sessionDirectory: directory,
    })
    const input = providerTurnInput()
    // A binding that outlived the process that created it: no adapter session
    // exists any more, so the turn itself has to carry the cursor.
    directory.upsert({
      adapterKey: adapter.adapterKey,
      providerDriverKind: adapter.driverKind,
      providerInstanceId: input.providerInstanceId,
      providerSessionId: 'mock:thread-1',
      resumeCursor: 'mock-thread:thread-1',
      runtimeMode: input.runtimeMode,
      runtimePayload: providerSessionPayload(input),
      status: 'ready',
      threadId: input.thread.id,
    })

    await service.sendTurn(input)

    expect(adapter.startedTurns[0]?.resumeCursor).toBe('mock-thread:thread-1')
    expect(adapter.startedSessions[0]?.resumeCursor).toBe('mock-thread:thread-1')
    fixture.close()
  })

  it('keeps a session parked on an approval reusable and listed', async () => {
    const fixture = createFixture()
    const adapter = new MockProviderAdapter()
    const directory = new ProviderSessionDirectory(fixture.database)
    const service = new ProviderService({
      adapterRegistry: new ProviderAdapterRegistry([adapter]),
      sessionDirectory: directory,
    })
    const input = providerTurnInput()
    const ensureInput = {
      providerInstanceId: input.providerInstanceId,
      runtimeMode: input.runtimeMode,
      runtimePayload: providerSessionPayload(input),
      threadId: input.thread.id,
    }

    await service.ensureSession(ensureInput)
    // Compaction, or an approval nobody has answered: the process is alive and
    // holding real state that dies with it.
    directory.markStatus(input.thread.id, 'waiting')

    // Listed while parked. The reuse call below writes the binding again, so
    // this is asserted before it rather than after.
    expect(service.listSessions()).toContainEqual(
      expect.objectContaining({ status: 'waiting', threadId: input.thread.id }),
    )
    expect(await service.ensureSession(ensureInput)).toMatchObject({ reused: true })

    // The negative: inverting the predicate must not make every status active.
    for (const dead of ['stopped', 'error', 'idle'] as const) {
      directory.markStatus(input.thread.id, dead)
      expect(service.listSessions()).not.toContainEqual(
        expect.objectContaining({ threadId: input.thread.id }),
      )
    }
    fixture.close()
  })

  it('drops the cursor when a thread is repointed at another provider instance', async () => {
    const fixture = createFixture()
    const codex = new MockProviderAdapter()
    const other = new MockProviderAdapter({
      providerInstanceId: v.parse(providerInstanceIdSchema, 'codex-personal'),
    })
    const directory = new ProviderSessionDirectory(fixture.database)
    const service = new ProviderService({
      adapterRegistry: new ProviderAdapterRegistry([codex, other]),
      sessionDirectory: directory,
    })
    const input = providerTurnInput()
    await service.ensureSession({
      providerInstanceId: input.providerInstanceId,
      runtimeMode: input.runtimeMode,
      runtimePayload: providerSessionPayload(input),
      threadId: input.thread.id,
    })

    await service.ensureSession({
      providerInstanceId: other.adapterKey,
      runtimeMode: input.runtimeMode,
      runtimePayload: {
        ...providerSessionPayload(input),
        modelSelection: { ...input.modelSelection, providerInstanceId: other.adapterKey },
      },
      threadId: input.thread.id,
    })

    // Another account cannot resume this one's conversation.
    expect(other.startedSessions.map((session) => session.resumeCursor)).toEqual([null])
    fixture.close()
  })

  it('routes provider turns and controls through the registered Codex adapter', async () => {
    const fixture = createFixture()
    const adapter = new MockProviderAdapter({ responseText: 'Service response' })
    const directory = new ProviderSessionDirectory(fixture.database)
    const service = new ProviderService({
      adapterRegistry: new ProviderAdapterRegistry([adapter]),
      sessionDirectory: directory,
    })
    const input = providerTurnInput()
    const fanOutEvents: ProviderRuntimeEvent[] = []
    const unsubscribe = service.subscribeRuntimeEvents((event) => {
      fanOutEvents.push(event)
    })

    await service.startSession({
      providerInstanceId: input.providerInstanceId,
      runtimeMode: input.runtimeMode,
      runtimePayload: providerSessionPayload(input),
      threadId: input.thread.id,
    })
    await service.sendTurn(input)
    await waitForRuntimeEvent(fanOutEvents, 'turn.completed')
    const activeSessions = service.listSessions()
    await service.interruptTurn({ threadId: input.thread.id, turnId: input.turnId })
    await service.stopSession({ threadId: input.thread.id })
    unsubscribe()

    expect(adapter.startedTurns).toHaveLength(1)
    expect(adapter.startedTurns[0]).toMatchObject({
      messageText: 'Say hello',
      providerInstanceId: DEFAULT_PROVIDER_INSTANCE_ID,
      turnId: input.turnId,
    })
    expect(adapter.interruptedThreads).toEqual([input.thread.id, input.thread.id])
    expect(fanOutEvents.map((event) => event.type)).toContain('turn.started')
    expect(fanOutEvents.map((event) => event.type)).toContain('assistant.delta')
    expect(fanOutEvents.map((event) => event.type)).toContain('assistant.complete')
    expect(fanOutEvents.map((event) => event.type)).toContain('turn.completed')
    expect(fanOutEvents.map((event) => event.type).slice(-3)).toEqual([
      'assistant.delta',
      'assistant.complete',
      'turn.completed',
    ])
    expect(activeSessions).toContainEqual(
      expect.objectContaining({ status: 'ready', threadId: input.thread.id }),
    )
    expect(directory.getBinding(input.thread.id)).toMatchObject({ status: 'stopped' })
    fixture.close()
  })

  it('marks isolated text generation ephemeral without creating a chat binding', async () => {
    const fixture = createFixture()
    const adapter = new MockProviderAdapter({ responseText: 'Generated title' })
    const directory = new ProviderSessionDirectory(fixture.database)
    const service = new ProviderService({
      adapterRegistry: new ProviderAdapterRegistry([adapter]),
      sessionDirectory: directory,
    })
    const input = providerTurnInput()

    const result = await service.generateText({
      cwd: input.cwd,
      messageText: 'Describe this diff',
      modelSelection: input.modelSelection,
    })

    expect(result).toEqual({ text: 'Generated title' })
    expect(adapter.startedSessions).toHaveLength(1)
    expect(adapter.startedSessions[0]).toMatchObject({
      ephemeral: true,
      runtimeMode: 'approval-required',
    })
    expect(adapter.startedTurns).toHaveLength(1)
    expect(adapter.startedTurns[0]).toMatchObject({
      ephemeral: true,
      runtimeMode: 'approval-required',
    })
    const generatedThreadId = adapter.startedTurns[0]!.thread.id
    expect(directory.getBinding(generatedThreadId)).toBeNull()
    expect(await adapter.hasSession({ threadId: generatedThreadId })).toBe(false)
    fixture.close()
  })

  it('closes an isolated session when cancellation lands before provider completion', async () => {
    const fixture = createFixture()
    const gate = Promise.withResolvers<void>()
    const adapter = new MockProviderAdapter({ beforeComplete: () => gate.promise })
    const service = new ProviderService({
      adapterRegistry: new ProviderAdapterRegistry([adapter]),
      sessionDirectory: new ProviderSessionDirectory(fixture.database),
    })
    const input = providerTurnInput()
    const controller = new AbortController()
    const generation = service.generateText({
      cwd: input.cwd,
      messageText: 'Describe this diff',
      modelSelection: input.modelSelection,
      signal: controller.signal,
    })

    await waitForCondition(() => adapter.startedTurns.length === 1, 'provider turn did not start')
    const generatedThreadId = adapter.startedTurns[0]!.thread.id
    controller.abort()
    await waitForCondition(
      async () => !(await adapter.hasSession({ threadId: generatedThreadId })),
      'cancelled provider session stayed open',
    )
    gate.resolve()

    await expect(generation).rejects.toThrow('Provider text generation was cancelled.')
    expect(adapter.interruptedThreads).toEqual([generatedThreadId, generatedThreadId])
    await service.shutdown()
    fixture.close()
  })

  it('leases an adapter while isolated generation survives settings reconciliation', async () => {
    const fixture = createFixture()
    const gate = Promise.withResolvers<void>()
    const adapter = new MockProviderAdapter({ beforeComplete: () => gate.promise })
    const registry = new ProviderAdapterRegistry([adapter])
    const service = new ProviderService({
      adapterRegistry: registry,
      sessionDirectory: new ProviderSessionDirectory(fixture.database),
    })
    const input = providerTurnInput()
    const generation = service.generateText({
      cwd: input.cwd,
      messageText: 'Describe this diff',
      modelSelection: input.modelSelection,
    })

    await waitForCondition(() => adapter.startedTurns.length === 1, 'provider turn did not start')
    await registry.reconcile([])
    expect(registry.adapter(DEFAULT_PROVIDER_INSTANCE_ID)).toBe(adapter)

    gate.resolve()
    await expect(generation).resolves.toEqual({ text: 'Mock response' })
    await waitForCondition(
      () => registry.adapter(DEFAULT_PROVIDER_INSTANCE_ID) === null,
      'deferred provider removal was not replayed after lease release',
    )
    await service.shutdown()
    fixture.close()
  })
})

function providerTurnInput(): ProviderTurnInput {
  const now = '2026-05-28T00:00:00.000Z'
  const projectId = v.parse(projectIdSchema, 'project-1')
  const threadId = v.parse(threadIdSchema, 'thread-1')
  const turnId = v.parse(turnIdSchema, 'turn-1')
  const modelSelection = {
    model: 'gpt-5-codex',
    providerInstanceId: DEFAULT_PROVIDER_INSTANCE_ID,
  }

  return {
    attachments: [],
    cwd: '/workspace',
    interactionMode: DEFAULT_INTERACTION_MODE,
    messageText: 'Say hello',
    modelSelection,
    project: {
      createdAt: now,
      defaultModelSelection: modelSelection,
      deletedAt: null,
      id: projectId,
      orderKey: null,
      scripts: [],
      title: 'Platform',
      updatedAt: now,
      workspaceRoot: '/workspace',
    },
    providerInstanceId: DEFAULT_PROVIDER_INSTANCE_ID,
    runtimeMode: DEFAULT_RUNTIME_MODE,
    thread: {
      activities: [],
      archivedAt: null,
      branch: null,
      createdAt: now,
      deletedAt: null,
      id: threadId,
      interactionMode: DEFAULT_INTERACTION_MODE,
      latestTurn: null,
      messages: [],
      modelSelection,
      projectId,
      runtimeMode: DEFAULT_RUNTIME_MODE,
      session: null,
      title: 'Test thread',
      updatedAt: now,
      worktreePath: '/workspace',
    },
    turnId,
  }
}

async function settleRuntimeEvents() {
  await Promise.resolve()
  await Promise.resolve()
}

async function waitForRuntimeEvent(
  events: ProviderRuntimeEvent[],
  type: ProviderRuntimeEvent['type'],
) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (events.some((event) => event.type === type)) return
    await settleRuntimeEvents()
  }
}

async function waitForCondition(predicate: () => boolean | Promise<boolean>, message: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await predicate()) return

    await new Promise((resolve) => setTimeout(resolve, 2))
  }

  expect.unreachable(message)
}

function providerSessionPayload(input: ProviderTurnInput) {
  return {
    activeTurnId: null,
    cwd: input.cwd,
    interactionMode: input.interactionMode,
    modelSelection: input.modelSelection,
    runtimeMode: input.runtimeMode,
  }
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

describe('ProviderService adapter streams', () => {
  it('follows an instance whose adapter is replaced in place', async () => {
    const fixture = createFixture()
    const home = await mkdtemp(path.join(tmpdir(), 'provider-stream-'))
    const registry = new ProviderAdapterRegistry({ drivers: [mockDriver] })
    const service = new ProviderService({
      adapterRegistry: registry,
      sessionDirectory: new ProviderSessionDirectory(fixture.database),
    })
    const seen: ProviderRuntimeEvent[] = []
    service.subscribeRuntimeEvents((event) => {
      seen.push(event)
    })

    try {
      await registry.reconcile([mockInstance({ credentialsPath: path.join(home, 'a.json') })])
      const first = registry.getByInstance(MOCK_INSTANCE)

      // A config change on an idle instance disposes its adapter and builds another under the
      // same id, so the id never leaves the live set and nothing re-points the stream by id alone.
      await registry.reconcile([mockInstance({ credentialsPath: path.join(home, 'b.json') })])
      expect(registry.getByInstance(MOCK_INSTANCE)).not.toBe(first)

      const input = providerTurnInput()
      await service.ensureSession({
        providerInstanceId: MOCK_INSTANCE,
        runtimeMode: input.runtimeMode,
        runtimePayload: {
          ...providerSessionPayload(input),
          modelSelection: { ...input.modelSelection, providerInstanceId: MOCK_INSTANCE },
        },
        threadId: input.thread.id,
      })
      await service.drainRuntimeEvents()

      expect(seen.length).toBeGreaterThan(0)
    } finally {
      await service.shutdown()
      await rm(home, { force: true, recursive: true })
      fixture.close()
    }
  })
})

describe('ProviderAdapterRegistry leases', () => {
  it('does not replay deferred desired state after disposal begins', async () => {
    const registry = new ProviderAdapterRegistry({ drivers: [mockDriver] })
    await registry.reconcile([mockInstance({ responseText: 'before' })])
    const lease = registry.acquireInstanceLease(MOCK_INSTANCE)
    await registry.reconcile([mockInstance({ responseText: 'after' })])

    const disposal = registry.dispose()
    lease.release()
    await disposal
    await registry.reconcile([mockInstance({ responseText: 'after' })])

    expect(registry.listInstances()).toEqual([])
  })
})

const MOCK_INSTANCE = v.parse(providerInstanceIdSchema, 'mock-work')

function mockInstance(config: Record<string, unknown>) {
  return {
    config,
    displayLabel: MOCK_INSTANCE,
    driverKind: MOCK_DRIVER_KIND,
    providerInstanceId: MOCK_INSTANCE,
  }
}
