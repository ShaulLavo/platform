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
