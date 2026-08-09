import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import type { PendingOrchestrationEvent } from '../event-store'
import { projectEvents } from '../projector'
import type { OrchestrationProjectedThread, OrchestrationReadModel } from '../read-model'
import {
  activityAppendedEvent,
  createProjectionFixture,
  messageSentEvent,
  pendingEvent,
  sessionSetEvent,
  threadBootstrapEvents,
  turnStartEvent,
  THREAD_ID,
} from './factories/projection'

const requestedAt = '2026-05-24T00:01:00.000Z'
const startedAt = '2026-05-24T00:02:00.000Z'
const settledAt = '2026-05-24T00:03:00.000Z'
const fixtures: Array<{ close: () => void }> = []

afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    fixture.close()
  }
})

describe('orchestration projection convergence', () => {
  it.each([
    { settledState: 'completed', status: 'idle' },
    { settledState: 'completed', status: 'ready' },
    { settledState: 'error', status: 'error' },
    { settledState: 'interrupted', status: 'interrupted' },
    { settledState: 'interrupted', status: 'stopped' },
  ])('settles a running turn when the session goes $status', ({ settledState, status }) => {
    const projected = project([
      ...threadBootstrapEvents(),
      turnStartEvent('turn-1', requestedAt),
      sessionSetEvent({ activeTurnId: 'turn-1', status: 'running', updatedAt: startedAt }),
      sessionSetEvent({ status, updatedAt: settledAt }),
    ])

    expect(projected.memory.latestTurn).toMatchObject({
      completedAt: settledAt,
      state: settledState,
      turnId: 'turn-1',
    })
    expect(projected.sqlThread.latestTurn).toEqual(projected.memory.latestTurn)
  })

  it.each(['starting', 'running'])('leaves the turn running while the session is %s', (status) => {
    const projected = project([
      ...threadBootstrapEvents(),
      turnStartEvent('turn-1', requestedAt),
      sessionSetEvent({ activeTurnId: 'turn-1', status, updatedAt: startedAt }),
    ])

    expect(projected.memory.latestTurn).toMatchObject({ completedAt: null, state: 'running' })
    expect(projected.sqlThread.latestTurn).toEqual(projected.memory.latestTurn)
  })

  it('settles a turn that produced no assistant message at all', () => {
    const projected = project([
      ...threadBootstrapEvents(),
      turnStartEvent('turn-1', requestedAt),
      sessionSetEvent({ activeTurnId: 'turn-1', status: 'running', updatedAt: startedAt }),
      sessionSetEvent({ lastError: 'provider died', status: 'error', updatedAt: settledAt }),
    ])

    expect(projected.memory.latestTurn?.state).toBe('error')
    expect(projected.sqlThread.latestTurn?.state).toBe('error')
  })

  it('agrees on the session and the turn after a stop request', () => {
    const projected = project([
      ...threadBootstrapEvents(),
      turnStartEvent('turn-1', requestedAt),
      sessionSetEvent({ activeTurnId: 'turn-1', status: 'running', updatedAt: startedAt }),
      pendingEvent(
        'thread.session-stop-requested',
        { createdAt: settledAt, threadId: THREAD_ID },
        settledAt,
      ),
    ])

    expect(projected.memory.session).toMatchObject({ status: 'stopped', updatedAt: settledAt })
    expect(projected.sqlThread.session).toEqual(projected.memory.session)
    expect(projected.memory.latestTurn).toMatchObject({
      completedAt: settledAt,
      state: 'interrupted',
    })
    expect(projected.sqlThread.latestTurn).toEqual(projected.memory.latestTurn)
  })

  it('replaces the streamed draft when a completion carries text, and backfills its turn', () => {
    const projected = project([
      ...threadBootstrapEvents(),
      turnStartEvent('turn-1', requestedAt),
      messageSentEvent({ messageId: 'message-1', streaming: true, text: 'Hel' }),
      messageSentEvent({ messageId: 'message-1', streaming: true, text: 'lo' }),
      messageSentEvent({
        messageId: 'message-1',
        streaming: false,
        text: 'Hello, world',
        turnId: 'turn-1',
        updatedAt: settledAt,
      }),
    ])

    expect(projected.memory.messages).toHaveLength(1)
    expect(projected.memory.messages[0]).toMatchObject({
      streaming: false,
      text: 'Hello, world',
      turnId: 'turn-1',
    })
    expect(projected.sqlThread.messages).toEqual(projected.memory.messages)
  })

  it('keeps the streamed draft when a completion carries no text', () => {
    const projected = project([
      ...threadBootstrapEvents(),
      messageSentEvent({ messageId: 'message-1', streaming: true, text: 'Hello' }),
      messageSentEvent({
        messageId: 'message-1',
        streaming: false,
        text: '',
        updatedAt: settledAt,
      }),
    ])

    expect(projected.memory.messages[0]).toMatchObject({ streaming: false, text: 'Hello' })
    expect(projected.sqlThread.messages).toEqual(projected.memory.messages)
  })

  it('keeps attachments a later frame does not carry', () => {
    const attachment = {
      id: 'attachment-1',
      mimeType: 'image/png',
      name: 'shot.png',
      sizeBytes: 12,
      type: 'image',
    }
    const projected = project([
      ...threadBootstrapEvents(),
      messageSentEvent({
        attachments: [attachment],
        messageId: 'message-1',
        role: 'user',
        streaming: false,
        text: 'Look at this',
      }),
      messageSentEvent({
        messageId: 'message-1',
        role: 'user',
        streaming: false,
        text: 'Look at this',
        turnId: 'turn-1',
        updatedAt: settledAt,
      }),
    ])

    expect(projected.memory.messages[0]).toMatchObject({
      attachments: [attachment],
      text: 'Look at this',
      turnId: 'turn-1',
    })
    expect(projected.sqlThread.messages).toEqual(projected.memory.messages)
  })

  it('does not append a replayed activity twice', () => {
    const projected = project([
      ...threadBootstrapEvents(),
      activityAppendedEvent({ id: 'event-activity-1' }),
      activityAppendedEvent({ id: 'event-activity-1' }),
    ])

    expect(projected.memory.activities).toHaveLength(1)
    expect(projected.sqlThread.activities).toHaveLength(1)
  })

  it('does not duplicate assistant text when a catch-up dies before its cursor advances', () => {
    const fixture = createProjectionFixture()
    fixtures.push(fixture)

    fixture.pipeline.applyEvents(fixture.append(threadBootstrapEvents()))
    fixture.append([messageSentEvent({ messageId: 'message-1', streaming: true, text: 'Hello' })])

    const appliedBeforeCrash = fixture.pipeline.lastAppliedSequence()
    failProjectionCursorWrites(fixture.database)
    expect(() => fixture.pipeline.catchUp()).toThrow()
    allowProjectionCursorWrites(fixture.database)

    expect(fixture.pipeline.lastAppliedSequence()).toBe(appliedBeforeCrash)
    fixture.pipeline.catchUp()

    const thread = projectedThread(fixture.snapshots.fullReadModel())
    expect(thread.messages[0]?.text).toBe('Hello')
  })
})

function project(events: PendingOrchestrationEvent[]) {
  const fixture = createProjectionFixture()
  fixtures.push(fixture)

  const appended = fixture.append(events)
  fixture.pipeline.applyEvents(appended)

  return {
    memory: projectedThread(projectEvents(appended)),
    sqlThread: projectedThread(fixture.snapshots.fullReadModel()),
  }
}

function projectedThread(model: OrchestrationReadModel) {
  const thread = model.threads.get(THREAD_ID)
  expect(thread).toBeDefined()

  return thread as OrchestrationProjectedThread
}

/**
 * A trigger, not a stub: real SQLite refusing the cursor write reproduces the
 * exact instant a crash used to land between projecting an event and recording
 * that it was projected.
 */
function failProjectionCursorWrites(
  database: ReturnType<typeof createProjectionFixture>['database'],
) {
  database.run(
    sql`create trigger projection_state_crash before insert on projection_state begin select raise(abort, 'crash'); end`,
  )
  database.run(
    sql`create trigger projection_state_crash_update before update on projection_state begin select raise(abort, 'crash'); end`,
  )
}

function allowProjectionCursorWrites(
  database: ReturnType<typeof createProjectionFixture>['database'],
) {
  database.run(sql`drop trigger projection_state_crash`)
  database.run(sql`drop trigger projection_state_crash_update`)
}
