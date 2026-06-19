import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import * as v from 'valibot'
import { migrateOrchestrationDatabase } from '../../db/migrations'
import * as schema from '../../db/schema'
import { OrchestrationEngine } from '../engine'
import { orchestrationCommandSchema, type OrchestrationCommand } from '../schemas'

const createdAt = '2026-05-24T00:00:00.000Z'
const requestedAt = '2026-05-24T00:01:00.000Z'
const assistantStartedAt = '2026-05-24T00:02:00.000Z'
const assistantCompletedAt = '2026-05-24T00:03:00.000Z'
const interruptedAt = '2026-05-24T00:04:00.000Z'
const latestRequestedAt = '2026-05-24T00:05:00.000Z'
const modelSelection = {
  providerInstanceId: 'codex',
  model: 'gpt-5-codex',
}
const fixtures: ClosableFixture[] = []

type ClosableFixture = {
  close: () => void
}

afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    fixture.close()
  }
})

describe('projection latest turn snapshots', () => {
  it('returns the canonical latest turn after an assistant turn completes', async () => {
    const engine = createEngine()
    const sourceProposedPlan = { planId: 'plan-1', threadId: 'thread-source' }

    await dispatchProjectThread(engine)
    await engine.dispatch(startTurnCommand({ sourceProposedPlan }))
    await engine.dispatch(assistantDeltaCommand())
    await engine.dispatch(assistantCompleteCommand())

    expect(latestTurn(engine)).toEqual({
      assistantMessageId: 'message-2',
      completedAt: assistantCompletedAt,
      requestedAt,
      sourceProposedPlan,
      startedAt: assistantStartedAt,
      state: 'completed',
      turnId: 'turn-1',
    })
  })

  it('returns interrupted latest turn state after a turn interrupt', async () => {
    const engine = createEngine()

    await dispatchProjectThread(engine)
    await engine.dispatch(startTurnCommand())
    await engine.dispatch(interruptTurnCommand())

    expect(latestTurn(engine)).toEqual({
      assistantMessageId: null,
      completedAt: interruptedAt,
      requestedAt,
      startedAt: null,
      state: 'interrupted',
      turnId: 'turn-1',
    })
  })

  it('keeps a late older-turn assistant message from replacing the latest turn', async () => {
    const engine = createEngine()

    await dispatchProjectThread(engine)
    await engine.dispatch(
      startTurnCommand({
        commandId: 'cmd-turn-old-start',
        messageId: 'message-old',
        turnId: 'turn-old',
      }),
    )
    await engine.dispatch(
      startTurnCommand({
        commandId: 'cmd-turn-latest-start',
        createdAt: latestRequestedAt,
        messageId: 'message-latest',
        text: 'Latest request',
        turnId: 'turn-latest',
      }),
    )
    await engine.dispatch(
      assistantCompleteCommand({
        commandId: 'cmd-assistant-old-complete',
        messageId: 'message-old-assistant',
        turnId: 'turn-old',
      }),
    )

    expect(latestTurn(engine)).toEqual({
      assistantMessageId: null,
      completedAt: null,
      requestedAt: latestRequestedAt,
      startedAt: null,
      state: 'running',
      turnId: 'turn-latest',
    })
  })
})

async function dispatchProjectThread(engine: OrchestrationEngine) {
  await engine.dispatch(projectCreateCommand())
  await engine.dispatch(threadCreateCommand())
}

function createEngine() {
  return new OrchestrationEngine(createFixture().database)
}

function createFixture() {
  const sqlite = new Database(':memory:', { create: true })
  const database = drizzle({ client: sqlite, schema })
  migrateOrchestrationDatabase(database)
  const fixture = { close: () => sqlite.close(), database }

  fixtures.push(fixture)

  return fixture
}

function projectCreateCommand() {
  return command({
    commandId: 'cmd-project-create',
    createdAt,
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
    createdAt,
    interactionMode: 'default',
    modelSelection,
    projectId: 'project-1',
    runtimeMode: 'full-access',
    threadId: 'thread-1',
    title: 'Projection',
    type: 'thread.create',
    worktreePath: null,
  })
}

function startTurnCommand(input: Partial<StartTurnInput> = {}) {
  return command({
    commandId: input.commandId ?? 'cmd-turn-start',
    createdAt: input.createdAt ?? requestedAt,
    interactionMode: 'default',
    message: {
      attachments: [],
      messageId: input.messageId ?? 'message-1',
      role: 'user',
      text: input.text ?? 'Build the first slice',
    },
    runtimeMode: 'full-access',
    sourceProposedPlan: input.sourceProposedPlan,
    threadId: 'thread-1',
    turnId: input.turnId ?? 'turn-1',
    type: 'thread.turn.start',
  })
}

type StartTurnInput = {
  commandId: string
  createdAt: string
  messageId: string
  sourceProposedPlan: { planId: string; threadId: string }
  text: string
  turnId: string
}

function assistantDeltaCommand() {
  return command({
    commandId: 'cmd-assistant-delta',
    createdAt: assistantStartedAt,
    delta: 'Done',
    messageId: 'message-2',
    threadId: 'thread-1',
    turnId: 'turn-1',
    type: 'thread.message.assistant.delta',
  })
}

function assistantCompleteCommand(input: Partial<AssistantCompleteInput> = {}) {
  return command({
    commandId: input.commandId ?? 'cmd-assistant-complete',
    completedAt: assistantCompletedAt,
    messageId: input.messageId ?? 'message-2',
    threadId: 'thread-1',
    turnId: input.turnId ?? 'turn-1',
    type: 'thread.message.assistant.complete',
  })
}

type AssistantCompleteInput = {
  commandId: string
  messageId: string
  turnId: string
}

function interruptTurnCommand() {
  return command({
    commandId: 'cmd-turn-interrupt',
    createdAt: interruptedAt,
    threadId: 'thread-1',
    turnId: 'turn-1',
    type: 'thread.turn.interrupt',
  })
}

function latestTurn(engine: OrchestrationEngine) {
  return engine.threadDetailSnapshot('thread-1').thread.latestTurn
}

function command(value: unknown) {
  return v.parse(orchestrationCommandSchema, value) as OrchestrationCommand
}
