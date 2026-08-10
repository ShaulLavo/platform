import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import * as v from 'valibot'
import * as schema from '../../db/schema'
import { migrateOrchestrationDatabase } from '../../db/migrations'
import { OrchestrationEngine } from '../engine'
import { orchestrationCommandSchema, type OrchestrationCommand } from '../schemas'

const fixtures: Array<{ close: () => void }> = []

afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.close()
})

describe('decider event envelope', () => {
  it('links a turn start to the message that caused it', async () => {
    const engine = await createEngineWithThread()

    await engine.dispatch(threadTurnStartCommand())

    const events = engine.replay({ afterSequence: 0 }).events
    const message = events.find((event) => event.type === 'thread.message-sent')
    const turnStart = events.find((event) => event.type === 'thread.turn-start-requested')
    expect(message).toBeDefined()
    expect(turnStart?.causationEventId).toBe(message?.eventId)
  })

  it('lifts the request id into the envelope of an approval response', async () => {
    const engine = await createEngineWithThread()

    await engine.dispatch(
      command({
        commandId: 'cmd-approval-respond',
        createdAt: '2026-05-24T00:02:00.000Z',
        decision: 'accept',
        requestId: 'req-1',
        threadId: 'thread-1',
        type: 'thread.approval.respond',
      }),
    )

    const responded = engine
      .replay({ afterSequence: 0 })
      .events.find((event) => event.type === 'thread.approval-response-requested')
    expect(responded?.metadata).toEqual({ requestId: 'req-1' })
  })

  it('lifts the request id into the envelope of a user-input response', async () => {
    const engine = await createEngineWithThread()

    await engine.dispatch(
      command({
        answers: { answer: 'yes' },
        commandId: 'cmd-user-input-respond',
        createdAt: '2026-05-24T00:02:00.000Z',
        requestId: 'req-2',
        threadId: 'thread-1',
        type: 'thread.user-input.respond',
      }),
    )

    const responded = engine
      .replay({ afterSequence: 0 })
      .events.find((event) => event.type === 'thread.user-input-response-requested')
    expect(responded?.metadata).toEqual({ requestId: 'req-2' })
  })

  it("lifts a request-carrying activity's request id, and leaves other activities bare", async () => {
    const engine = await createEngineWithThread()

    await engine.dispatch(
      activityAppendCommand('activity-approval-1', 'approval.requested', {
        requestId: 'req-3',
      }),
    )
    await engine.dispatch(activityAppendCommand('activity-tool-1', 'tool.started', null))

    const events = engine.replay({ afterSequence: 0 }).events
    const request = events.find(
      (event) =>
        event.type === 'thread.activity-appended' &&
        event.payload.activity.id === 'activity-approval-1',
    )
    const tool = events.find(
      (event) =>
        event.type === 'thread.activity-appended' &&
        event.payload.activity.id === 'activity-tool-1',
    )
    expect(request?.metadata).toEqual({ requestId: 'req-3' })
    expect(tool?.metadata).toEqual({})
  })
})

function activityAppendCommand(id: string, kind: string, payload: unknown) {
  return command({
    activity: {
      createdAt: '2026-05-24T00:02:00.000Z',
      id,
      kind,
      payload,
      summary: kind,
      threadId: 'thread-1',
      tone: 'info',
      turnId: null,
    },
    commandId: `cmd-${id}`,
    createdAt: '2026-05-24T00:02:00.000Z',
    threadId: 'thread-1',
    type: 'thread.activity.append',
  })
}

function threadTurnStartCommand() {
  return command({
    commandId: 'cmd-turn-start',
    interactionMode: 'default',
    message: { messageId: 'message-1', role: 'user', text: 'Build the first slice' },
    runtimeMode: 'full-access',
    threadId: 'thread-1',
    turnId: 'turn-1',
    type: 'thread.turn.start',
  })
}

function command(value: unknown) {
  return v.parse(orchestrationCommandSchema, value) as OrchestrationCommand
}

function createEngine() {
  const sqlite = new Database(':memory:', { create: true })
  const database = drizzle({ client: sqlite, schema })
  migrateOrchestrationDatabase(database)
  fixtures.push({ close: () => sqlite.close() })

  return new OrchestrationEngine(database)
}

async function createEngineWithThread() {
  const engine = createEngine()
  await engine.dispatch(
    command({
      commandId: 'cmd-project-create',
      createdAt: '2026-05-24T00:00:00.000Z',
      defaultModelSelection: null,
      projectId: 'project-1',
      title: 'Platform',
      type: 'project.create',
      workspaceRoot: '/workspace',
    }),
  )
  await engine.dispatch(
    command({
      branch: null,
      commandId: 'cmd-thread-create',
      interactionMode: 'default',
      modelSelection: { model: 'gpt-5-codex', providerInstanceId: 'codex' },
      projectId: 'project-1',
      runtimeMode: 'full-access',
      threadId: 'thread-1',
      title: 'Phase 2',
      type: 'thread.create',
      worktreePath: null,
    }),
  )

  return engine
}
