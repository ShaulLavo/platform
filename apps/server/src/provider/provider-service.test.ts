import { Database } from 'bun:sqlite'
import { describe, expect, it } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as v from 'valibot'
import {
  DEFAULT_INTERACTION_MODE,
  DEFAULT_PROVIDER_INSTANCE_ID,
  DEFAULT_RUNTIME_MODE,
  projectIdSchema,
  threadIdSchema,
  turnIdSchema,
} from '@workspace/contracts'
import { migrateOrchestrationDatabase } from '../db/migrations'
import * as schema from '../db/schema'
import { MockProviderAdapter } from './adapters/mock'
import { ProviderAdapterRegistry } from './provider-adapter-registry'
import { ProviderService } from './provider-service'
import { ProviderSessionDirectory } from './provider-session-directory'
import type { ProviderRuntimeEvent, ProviderTurnInput } from './types'

describe('ProviderService', () => {
  it('reuses compatible session bindings and resets incompatible ones', () => {
    const fixture = createFixture()
    const adapter = new MockProviderAdapter()
    const service = new ProviderService({
      adapterRegistry: new ProviderAdapterRegistry([adapter]),
      sessionDirectory: new ProviderSessionDirectory(fixture.database),
    })
    const input = providerTurnInput()
    const first = service.ensureSession({
      providerInstanceId: input.providerInstanceId,
      runtimeMode: input.runtimeMode,
      runtimePayload: providerSessionPayload(input),
      threadId: input.thread.id,
    })
    const reused = service.ensureSession({
      providerInstanceId: input.providerInstanceId,
      runtimeMode: input.runtimeMode,
      runtimePayload: { ...providerSessionPayload(input), activeTurnId: input.turnId },
      threadId: input.thread.id,
    })
    const reset = service.ensureSession({
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
    expect(reset).toMatchObject({ binding: { providerSessionId: null }, reused: false })
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
    const runtimeEvents: ProviderRuntimeEvent[] = []
    const fanOutEvents: ProviderRuntimeEvent[] = []
    const unsubscribe = service.subscribeRuntimeEvents((event) => {
      fanOutEvents.push(event)
    })

    service.startSession({
      providerInstanceId: input.providerInstanceId,
      runtimeMode: input.runtimeMode,
      runtimePayload: { modelSelection: input.modelSelection },
      threadId: input.thread.id,
    })
    await service.sendTurn(input, {
      ingest: async (event) => {
        runtimeEvents.push(event)
      },
    })
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
    expect(runtimeEvents.map((event) => event.type)).toEqual([
      'assistant.delta',
      'assistant.complete',
    ])
    expect(fanOutEvents.map((event) => event.type)).toEqual([
      'assistant.delta',
      'assistant.complete',
    ])
    expect(activeSessions).toContainEqual(
      expect.objectContaining({ status: 'running', threadId: input.thread.id }),
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
