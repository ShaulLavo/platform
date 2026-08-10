import { Database } from 'bun:sqlite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import * as v from 'valibot'
import { pinOrderKeyBetween, planPinnedReorder } from '@workspace/contracts'
import { migrateOrchestrationDatabase } from '../../db/migrations'
import * as schema from '../../db/schema'
import { projectionThreads } from '../../db/schema'
import { OrchestrationEngine } from '../engine'
import { orchestrationCommandSchema, type OrchestrationCommand } from '../schemas'

const modelSelection = { model: 'gpt-5-codex', providerInstanceId: 'codex' }
const fixtures: Array<{ close: () => void }> = []
let commandCounter = 0

afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.close()
  commandCounter = 0
})

describe('settle guards', () => {
  it('refuses to settle a thread whose session is alive', async () => {
    const { engine } = await createEngineWithThread()
    await engine.dispatch(sessionSetCommand('running'))

    await expect(engine.dispatch(settleCommand())).rejects.toMatchObject({
      code: 'orchestration.THREAD_SESSION_ACTIVE',
      status: 409,
    })
  })

  it('refuses to settle a thread with an open approval request', async () => {
    const { engine } = await createEngineWithThread()
    await engine.dispatch(activityCommand('approval.requested', 'approval'))

    await expect(engine.dispatch(settleCommand())).rejects.toMatchObject({
      code: 'orchestration.THREAD_BLOCKING_REQUEST',
      status: 409,
    })
  })

  it('settles once the request resolves', async () => {
    const { database, engine } = await createEngineWithThread()
    await engine.dispatch(activityCommand('approval.requested', 'approval'))
    await engine.dispatch(activityCommand('approval.resolved', 'info'))

    await engine.dispatch(settleCommand())

    expect(threadRow(database).settledOverride).toBe('settled')
  })

  it('settles once a respond failure proves the request is gone', async () => {
    const { database, engine } = await createEngineWithThread()
    await engine.dispatch(activityCommand('user-input.requested', 'info'))
    await engine.dispatch(
      activityCommand('provider.user-input.respond.failed', 'error', {
        detail: 'Stale pending user-input request: request-1. Restart the turn to continue.',
        requestId: 'request-1',
      }),
    )

    await engine.dispatch(settleCommand())

    expect(threadRow(database).settledOverride).toBe('settled')
  })

  it('keeps refusing when the respond failure was merely transient', async () => {
    const { engine } = await createEngineWithThread()
    await engine.dispatch(activityCommand('user-input.requested', 'info'))
    await engine.dispatch(
      activityCommand('provider.user-input.respond.failed', 'error', {
        detail: 'Provider socket hung up',
        requestId: 'request-1',
      }),
    )

    await expect(engine.dispatch(settleCommand())).rejects.toMatchObject({
      code: 'orchestration.THREAD_BLOCKING_REQUEST',
    })
  })

  it('refuses to settle or snooze a thread whose turn is queued but unadopted', async () => {
    const { engine } = await createEngineWithThread()
    await engine.dispatch(turnStartCommand())

    await expect(engine.dispatch(settleCommand())).rejects.toMatchObject({
      code: 'orchestration.THREAD_QUEUED_TURN_START',
      status: 409,
    })
    await expect(engine.dispatch(snoozeCommand())).rejects.toMatchObject({
      code: 'orchestration.THREAD_QUEUED_TURN_START',
    })
  })

  it('lets a snooze through once a session has adopted the turn', async () => {
    const { database, engine } = await createEngineWithThread()
    await engine.dispatch(turnStartCommand())
    await engine.dispatch(sessionSetCommand('running'))

    await engine.dispatch(snoozeCommand())

    expect(threadRow(database).snoozedUntil).toBe(futureWakeTime())
  })

  it('refuses a snooze whose wake time is not in the future', async () => {
    const { engine } = await createEngineWithThread()

    await expect(
      engine.dispatch(snoozeCommand({ snoozedUntil: '1999-01-01T00:00:00.000Z' })),
    ).rejects.toMatchObject({ code: 'orchestration.THREAD_SNOOZE_NOT_FUTURE', status: 400 })
    await expect(
      engine.dispatch(snoozeCommand({ snoozedUntil: 'not-a-timestamp' })),
    ).rejects.toMatchObject({ code: 'orchestration.THREAD_SNOOZE_NOT_FUTURE' })
  })

  it('refuses to reorder a thread that is not pinned', async () => {
    const { engine } = await createEngineWithThread()

    await expect(engine.dispatch(pinReorderCommand('m'))).rejects.toMatchObject({
      code: 'orchestration.THREAD_NOT_PINNED',
      status: 409,
    })
  })

  it('refuses every lifecycle command on an archived thread', async () => {
    const { engine } = await createEngineWithThread()
    await engine.dispatch(command({ threadId: 'thread-1', type: 'thread.archive' }))

    await expect(engine.dispatch(settleCommand())).rejects.toMatchObject({
      code: 'orchestration.THREAD_ARCHIVED',
    })
    await expect(engine.dispatch(snoozeCommand())).rejects.toMatchObject({
      code: 'orchestration.THREAD_ARCHIVED',
    })
    await expect(engine.dispatch(pinCommand())).rejects.toMatchObject({
      code: 'orchestration.THREAD_ARCHIVED',
    })
  })
})

describe('settle and snooze projection', () => {
  it('projects a settle and then clears it on unsettle', async () => {
    const { database, engine } = await createEngineWithThread()

    await engine.dispatch(settleCommand())
    const settled = threadRow(database)

    expect(settled.settledOverride).toBe('settled')
    expect(settled.settledAt).toEqual(expect.any(String))

    await engine.dispatch(
      command({ reason: 'user', threadId: 'thread-1', type: 'thread.unsettle' }),
    )
    const unsettled = threadRow(database)

    expect(unsettled.settledOverride).toBe('active')
    expect(unsettled.settledAt).toBeNull()
  })

  it('projects a duplicate settle as a no-op', async () => {
    const { database, engine } = await createEngineWithThread()
    await engine.dispatch(settleCommand())
    const first = threadRow(database)
    await tick()

    await engine.dispatch(settleCommand())
    const second = threadRow(database)

    expect(second.settledAt).toBe(first.settledAt)
    expect(second.updatedAt).toBe(first.updatedAt)
    const settledEvents = engine
      .replay({ afterSequence: 0 })
      .events.filter((event) => event.type === 'thread.settled')
    expect(settledEvents).toHaveLength(2)
  })

  it('projects a duplicate snooze to the same wake time as a no-op', async () => {
    const { database, engine } = await createEngineWithThread()
    await engine.dispatch(snoozeCommand())
    const first = threadRow(database)
    await tick()

    await engine.dispatch(snoozeCommand())
    const second = threadRow(database)

    expect(second.snoozedAt).toBe(first.snoozedAt)
    expect(second.updatedAt).toBe(first.updatedAt)
  })

  it('stamps fresh timestamps when the snooze moves to a different wake time', async () => {
    const { database, engine } = await createEngineWithThread()
    await engine.dispatch(snoozeCommand())
    const first = threadRow(database)
    await tick()

    await engine.dispatch(snoozeCommand({ snoozedUntil: futureWakeTime(2) }))
    const second = threadRow(database)

    expect(second.snoozedUntil).toBe(futureWakeTime(2))
    expect(second.snoozedAt).not.toBe(first.snoozedAt)
  })

  it('clears the snooze on unsnooze', async () => {
    const { database, engine } = await createEngineWithThread()
    await engine.dispatch(snoozeCommand())

    await engine.dispatch(
      command({ reason: 'user', threadId: 'thread-1', type: 'thread.unsnooze' }),
    )

    expect(threadRow(database).snoozedUntil).toBeNull()
    expect(threadRow(database).snoozedAt).toBeNull()
  })
})

describe('activity auto-unsettles', () => {
  it('wakes a settled thread when a session comes alive, with reason activity', async () => {
    const { database, engine } = await createEngineWithThread()
    await engine.dispatch(settleCommand())

    await engine.dispatch(sessionSetCommand('starting'))

    expect(threadRow(database).settledOverride).toBeNull()
    expect(unsettledReasons(engine)).toEqual(['activity'])
  })

  it('leaves a settled thread alone when the session merely reports a late status', async () => {
    const { database, engine } = await createEngineWithThread()
    await engine.dispatch(settleCommand())

    await engine.dispatch(sessionSetCommand('stopped'))

    expect(threadRow(database).settledOverride).toBe('settled')
    expect(unsettledReasons(engine)).toEqual([])
  })

  it('does not spend the snooze when a session merely starts', async () => {
    const { database, engine } = await createEngineWithThread()
    await engine.dispatch(snoozeCommand())

    await engine.dispatch(sessionSetCommand('starting'))

    expect(threadRow(database).snoozedUntil).toBe(futureWakeTime())
  })

  it('wakes a settled thread when an approval request arrives', async () => {
    const { database, engine } = await createEngineWithThread()
    await engine.dispatch(settleCommand())

    await engine.dispatch(activityCommand('approval.requested', 'approval'))

    expect(threadRow(database).settledOverride).toBeNull()
    expect(unsettledReasons(engine)).toEqual(['activity'])
  })

  it('leaves a settled thread alone for ordinary activity', async () => {
    const { database, engine } = await createEngineWithThread()
    await engine.dispatch(settleCommand())

    await engine.dispatch(activityCommand('tool.call', 'tool'))

    expect(threadRow(database).settledOverride).toBe('settled')
  })

  it('spends both the settle and the snooze when the user sends a message', async () => {
    const { database, engine } = await createEngineWithThread()
    await engine.dispatch(snoozeCommand())
    await engine.dispatch(
      command({ reason: 'user', threadId: 'thread-1', type: 'thread.unsettle' }),
    )

    await engine.dispatch(turnStartCommand())
    const row = threadRow(database)

    expect(row.settledOverride).toBeNull()
    expect(row.snoozedUntil).toBeNull()
    expect(unsettledReasons(engine)).toEqual(['user', 'activity'])
  })
})

describe('pinning', () => {
  it('promotes a settled, snoozed thread and clears both with reason user', async () => {
    const { database, engine } = await createEngineWithThread()
    await engine.dispatch(snoozeCommand())
    await engine.dispatch(settleCommand())

    await engine.dispatch(pinCommand({ orderKey: 'm' }))
    const row = threadRow(database)

    expect(row.pinnedAt).toEqual(expect.any(String))
    expect(row.pinOrderKey).toBe('m')
    expect(row.settledOverride).toBe('active')
    expect(row.snoozedUntil).toBeNull()
    expect(unsettledReasons(engine)).toEqual(['user'])
  })

  it('keeps the key the user already placed when a re-pin races in', async () => {
    const { database, engine } = await createEngineWithThread()
    await engine.dispatch(pinCommand({ orderKey: 'm' }))
    const first = threadRow(database)
    await tick()

    await engine.dispatch(pinCommand({ orderKey: 'c' }))
    const second = threadRow(database)

    expect(second.pinOrderKey).toBe('m')
    expect(second.pinnedAt).toBe(first.pinnedAt)
    expect(second.updatedAt).toBe(first.updatedAt)
  })

  it('clears the pin when the thread is settled by hand', async () => {
    const { database, engine } = await createEngineWithThread()
    await engine.dispatch(pinCommand({ orderKey: 'm' }))

    await engine.dispatch(settleCommand())
    const row = threadRow(database)

    expect(row.pinnedAt).toBeNull()
    expect(row.pinOrderKey).toBeNull()
    expect(row.settledOverride).toBe('settled')
  })

  it('drops the key on unpin so a later pin starts from the tail', async () => {
    const { database, engine } = await createEngineWithThread()
    await engine.dispatch(pinCommand({ orderKey: 'm' }))

    await engine.dispatch(command({ threadId: 'thread-1', type: 'thread.unpin' }))
    const row = threadRow(database)

    expect(row.pinnedAt).toBeNull()
    expect(row.pinOrderKey).toBeNull()
  })

  it('writes exactly one key to one row for a drag across three pinned threads', async () => {
    const { database, engine } = await createEngineWithThread()
    await engine.dispatch(threadCreateCommand('thread-2'))
    await engine.dispatch(threadCreateCommand('thread-3'))
    await engine.dispatch(pinCommand({ orderKey: 'b', threadId: 'thread-1' }))
    await engine.dispatch(pinCommand({ orderKey: 'd', threadId: 'thread-2' }))
    await engine.dispatch(pinCommand({ orderKey: 'f', threadId: 'thread-3' }))
    const before = pinnedOrder(database)
    expect(before).toEqual(['thread-1', 'thread-2', 'thread-3'])

    const writes = planPinnedReorder({
      keysById: new Map(pinnedRows(database).map((row) => [row.threadId, row.pinOrderKey])),
      movedId: 'thread-3',
      orderedIds: ['thread-1', 'thread-3', 'thread-2'],
    })
    expect(writes).toHaveLength(1)
    await engine.dispatch(pinReorderCommand(writes[0]!.orderKey, writes[0]!.id))

    expect(pinnedOrder(database)).toEqual(['thread-1', 'thread-3', 'thread-2'])
    expect(pinnedRows(database).filter((row) => row.threadId !== 'thread-3')).toEqual([
      expect.objectContaining({ pinOrderKey: 'b', threadId: 'thread-1' }),
      expect.objectContaining({ pinOrderKey: 'd', threadId: 'thread-2' }),
    ])
    expect(
      engine.replay({ afterSequence: 0 }).events.filter((e) => e.type === 'thread.pin-reordered'),
    ).toHaveLength(1)
  })

  it('keeps the order stable across repeated splits of the same gap', async () => {
    const { database, engine } = await createEngineWithThread()
    await engine.dispatch(threadCreateCommand('thread-2'))
    await engine.dispatch(pinCommand({ orderKey: 'b', threadId: 'thread-1' }))
    await engine.dispatch(pinCommand({ orderKey: 'd', threadId: 'thread-2' }))

    // Twenty drags onto the same edge: the fractional key keeps splitting the
    // gap, and the row that was dragged is on top every single time.
    for (let step = 0; step < 20; step += 1) {
      const rows = pinnedRows(database)
      const moved = rows.at(-1)!
      const orderKey = pinOrderKeyBetween(null, rows[0]!.pinOrderKey)
      expect(orderKey).not.toBeNull()

      await engine.dispatch(pinReorderCommand(orderKey!, moved.threadId))

      expect(pinnedOrder(database)[0]).toBe(moved.threadId)
    }
  })

  it('projects a duplicate reorder onto the same key as a no-op', async () => {
    const { database, engine } = await createEngineWithThread()
    await engine.dispatch(pinCommand({ orderKey: 'm' }))
    await engine.dispatch(pinReorderCommand('n'))
    const first = threadRow(database)
    await tick()

    await engine.dispatch(pinReorderCommand('n'))

    expect(threadRow(database).updatedAt).toBe(first.updatedAt)
  })
})

function unsettledReasons(engine: OrchestrationEngine) {
  return engine
    .replay({ afterSequence: 0 })
    .events.flatMap((event) => (event.type === 'thread.unsettled' ? [event.payload.reason] : []))
}

function threadRow(database: TestDatabase, threadId = 'thread-1') {
  return database
    .select()
    .from(projectionThreads)
    .where(eq(projectionThreads.threadId, threadId))
    .get()!
}

/** The pinned block as the client renders it: keys compared as plain strings. */
function pinnedRows(database: TestDatabase) {
  return database
    .select()
    .from(projectionThreads)
    .all()
    .filter((row) => row.pinnedAt !== null)
    .toSorted((left, right) => comparePinOrderKeys(left.pinOrderKey, right.pinOrderKey))
}

function comparePinOrderKeys(left: string | null, right: string | null) {
  if ((left ?? '') < (right ?? '')) return -1
  if ((left ?? '') > (right ?? '')) return 1

  return 0
}

function pinnedOrder(database: TestDatabase) {
  return pinnedRows(database).map((row) => row.threadId)
}

/**
 * Server-clock stamps have millisecond resolution, so two dispatches in the
 * same tick are indistinguishable. Advancing the clock is what makes
 * "re-emitted the original timestamp" a real observation instead of a
 * coincidence.
 */
function tick() {
  return new Promise((resolve) => setTimeout(resolve, 5))
}

function futureWakeTime(days = 1) {
  return `2099-01-0${days}T00:00:00.000Z`
}

function settleCommand(threadId = 'thread-1') {
  return command({ threadId, type: 'thread.settle' })
}

function snoozeCommand(input: { snoozedUntil?: string; threadId?: string } = {}) {
  return command({
    snoozedUntil: input.snoozedUntil ?? futureWakeTime(),
    threadId: input.threadId ?? 'thread-1',
    type: 'thread.snooze',
  })
}

function pinCommand(input: { orderKey?: string; threadId?: string } = {}) {
  return command({
    ...(input.orderKey ? { orderKey: input.orderKey } : {}),
    threadId: input.threadId ?? 'thread-1',
    type: 'thread.pin',
  })
}

function pinReorderCommand(orderKey: string, threadId = 'thread-1') {
  return command({ orderKey, threadId, type: 'thread.pin.reorder' })
}

function sessionSetCommand(status: string, threadId = 'thread-1') {
  return command({
    createdAt: '2026-06-01T00:00:00.000Z',
    session: {
      activeTurnId: null,
      lastError: null,
      providerInstanceId: 'codex',
      providerName: 'codex',
      providerSessionId: 'provider-session-1',
      runtimeMode: 'full-access',
      status,
      threadId,
      updatedAt: '2026-06-01T00:00:00.000Z',
    },
    threadId,
    type: 'thread.session.set',
  })
}

function activityCommand(
  kind: string,
  tone: string,
  payload: unknown = { requestId: 'request-1' },
) {
  return command({
    activity: {
      createdAt: '2026-06-01T00:00:00.000Z',
      id: `activity-${(commandCounter += 1)}`,
      kind,
      payload,
      summary: kind,
      threadId: 'thread-1',
      tone,
      turnId: null,
    },
    createdAt: '2026-06-01T00:00:00.000Z',
    threadId: 'thread-1',
    type: 'thread.activity.append',
  })
}

function turnStartCommand(threadId = 'thread-1') {
  return command({
    interactionMode: 'default',
    message: { messageId: `message-${(commandCounter += 1)}`, role: 'user', text: 'Ship it' },
    runtimeMode: 'full-access',
    threadId,
    turnId: `turn-${commandCounter}`,
    type: 'thread.turn.start',
  })
}

function threadCreateCommand(threadId: string) {
  return command({
    branch: null,
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

/** Every command needs its own id; the engine dedupes by receipt otherwise. */
function command(value: Record<string, unknown>) {
  commandCounter += 1

  return v.parse(orchestrationCommandSchema, {
    commandId: `cmd-${commandCounter}`,
    ...value,
  }) as OrchestrationCommand
}

type TestDatabase = ReturnType<typeof drizzle<typeof schema>>

async function createEngineWithThread() {
  const sqlite = new Database(':memory:', { create: true })
  const database = drizzle({ client: sqlite, schema })
  migrateOrchestrationDatabase(database)
  fixtures.push({ close: () => sqlite.close() })
  const engine = new OrchestrationEngine(database)

  await engine.dispatch(
    command({
      defaultModelSelection: null,
      projectId: 'project-1',
      title: 'Platform',
      type: 'project.create',
      workspaceRoot: '/workspace',
    }),
  )
  await engine.dispatch(threadCreateCommand('thread-1'))

  return { database, engine }
}
