import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import * as v from 'valibot'
import { migrateOrchestrationDatabase } from '../../db/migrations'
import * as schema from '../../db/schema'
import { OrchestrationEngine } from '../engine'
import { orchestrationCommandSchema, type OrchestrationCommand } from '../schemas'

const assistantStartedAt = '2026-05-24T00:02:00.000Z'
const assistantCompletedAt = '2026-05-24T00:03:00.000Z'
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
    const before = new Date().toISOString()

    await dispatchProjectThread(engine)
    await engine.dispatch(startTurnCommand({ sourceProposedPlan }))
    await engine.dispatch(assistantDeltaCommand())
    await engine.dispatch(assistantCompleteCommand())

    const turn = latestTurn(engine)

    expect(turn).toEqual({
      assistantMessageId: 'message-2',
      // Provider-runtime commands still carry their own event time.
      completedAt: assistantCompletedAt,
      requestedAt: turn?.requestedAt,
      sourceProposedPlan,
      startedAt: assistantStartedAt,
      state: 'completed',
      turnId: 'turn-1',
    })
    expectServerStamped(turn?.requestedAt, before)
  })

  it('returns interrupted latest turn state after a turn interrupt', async () => {
    const engine = createEngine()
    const before = new Date().toISOString()

    await dispatchProjectThread(engine)
    await engine.dispatch(startTurnCommand())
    await engine.dispatch(interruptTurnCommand())

    const turn = latestTurn(engine)

    expect(turn).toEqual({
      assistantMessageId: null,
      completedAt: turn?.completedAt,
      requestedAt: turn?.requestedAt,
      startedAt: null,
      state: 'interrupted',
      turnId: 'turn-1',
    })
    expectServerStamped(turn?.requestedAt, before)
    // The interrupt is a client command, so the server clock closes the turn.
    expectServerStamped(turn?.completedAt, turn?.requestedAt)
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
    const oldRequestedAt = latestTurn(engine)?.requestedAt
    await engine.dispatch(
      startTurnCommand({
        commandId: 'cmd-turn-latest-start',
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

    const turn = latestTurn(engine)

    expect(turn).toEqual({
      assistantMessageId: null,
      completedAt: null,
      requestedAt: turn?.requestedAt,
      startedAt: null,
      state: 'running',
      turnId: 'turn-latest',
    })
    expectServerStamped(turn?.requestedAt, oldRequestedAt)
  })
})

/**
 * ISO-8601 UTC strings sort lexicographically, so a plain compare is a real
 * ordering assertion: the value has to be the server's own reading taken at or
 * after `notBefore`, never a timestamp a client could have supplied.
 */
function expectServerStamped(value: string | null | undefined, notBefore: string | undefined) {
  expect(typeof value).toBe('string')
  expect(Number.isNaN(Date.parse(value ?? ''))).toBe(false)
  expect(value! >= notBefore!).toBe(true)
}

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
