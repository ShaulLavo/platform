import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import type { PendingOrchestrationEvent } from '../event-store'
import { projectEvents } from '../projector'
import {
  threadPlanProgress,
  type OrchestrationProjectedThread,
  type OrchestrationReadModel,
} from '../read-model'
import { createShellRowReader } from '../shell-row-reader'
import {
  activityAppendedEvent,
  createProjectionFixture,
  messageSentEvent,
  pendingEvent,
  sessionSetEvent,
  threadBootstrapEvents,
  turnDiffCompletedEvent,
  turnStartEvent,
  PROJECT_ID,
  THREAD_ID,
} from './factories/projection'

const requestedAt = '2026-05-24T00:01:00.000Z'
const revisedAt = '2026-05-24T00:01:50.000Z'
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

  it('corrects the persisted activity when a revised frame re-emits the same id', () => {
    const projected = project([
      ...threadBootstrapEvents(),
      activityAppendedEvent({
        id: 'event-activity-1',
        kind: 'tool.started',
        payload: { itemType: 'file-read', status: 'running' },
        summary: 'Read started',
        tone: 'tool',
      }),
      activityAppendedEvent({
        createdAt: revisedAt,
        id: 'event-activity-1',
        kind: 'tool.completed',
        payload: { itemType: 'file-read', status: 'completed' },
        summary: 'Read 40 lines',
        tone: 'info',
      }),
    ])

    // Both read models fold the same events, so a revision that only one of
    // them applies is a divergence that surfaces as the timeline and the rail
    // disagreeing about what a tool call did.
    for (const activities of [projected.sqlThread.activities, projected.memory.activities]) {
      expect(activities).toHaveLength(1)
      expect(activities[0]).toMatchObject({
        kind: 'tool.completed',
        payload: { itemType: 'file-read', status: 'completed' },
        summary: 'Read 40 lines',
        tone: 'info',
      })
    }
  })

  it('leaves a revised activity where the first frame put it, in both read models', () => {
    const projected = project([
      ...threadBootstrapEvents(),
      activityAppendedEvent({ id: 'event-activity-1', summary: 'Read started' }),
      activityAppendedEvent({
        createdAt: '2026-05-24T00:01:40.000Z',
        id: 'event-activity-2',
        summary: 'Grep started',
      }),
      activityAppendedEvent({
        createdAt: revisedAt,
        id: 'event-activity-1',
        summary: 'Read 40 lines',
      }),
    ])

    for (const activities of [projected.sqlThread.activities, projected.memory.activities]) {
      expect(activities.map((activity) => activity.id)).toEqual([
        'event-activity-1',
        'event-activity-2',
      ])
      expect(activities[0]).toMatchObject({
        createdAt: '2026-05-24T00:01:30.000Z',
        summary: 'Read 40 lines',
      })
    }
  })

  it('backfills a revised activity onto its turn and never erases the turn again', () => {
    const projected = project([
      ...threadBootstrapEvents(),
      turnStartEvent('turn-1', requestedAt),
      activityAppendedEvent({ id: 'event-activity-1', turnId: 'turn-1' }),
      activityAppendedEvent({ id: 'event-activity-2', turnId: null }),
      activityAppendedEvent({ createdAt: revisedAt, id: 'event-activity-1', turnId: null }),
      activityAppendedEvent({ createdAt: revisedAt, id: 'event-activity-2', turnId: 'turn-1' }),
    ])

    for (const activities of [projected.sqlThread.activities, projected.memory.activities]) {
      expect(activities.map((activity) => activity.turnId)).toEqual(['turn-1', 'turn-1'])
    }
  })

  it('projects the plan step the thread is on, and both read models agree on it', () => {
    const projected = project([
      ...threadBootstrapEvents(),
      turnStartEvent('turn-1', requestedAt),
      planActivity('activity-plan-1', [
        { status: 'completed', step: 'Read the code' },
        { status: 'inProgress', step: 'Run the tests' },
        { status: 'pending', step: 'Write the report' },
      ]),
    ])

    expect(projected.shell?.planProgress).toEqual({
      completedSteps: 1,
      step: 'Run the tests',
      totalSteps: 3,
      turnId: 'turn-1',
    })
    expectPlanProgressConverges(projected)
  })

  it('narrates the first pending step of a plan nothing has started yet', () => {
    const projected = project([
      ...threadBootstrapEvents(),
      turnStartEvent('turn-1', requestedAt),
      planActivity('activity-plan-1', [
        { status: 'pending', step: 'Read the code' },
        { status: 'pending', step: 'Run the tests' },
      ]),
    ])

    expect(projected.shell?.planProgress).toMatchObject({
      completedSteps: 0,
      step: 'Read the code',
    })
    expectPlanProgressConverges(projected)
  })

  /**
   * The fold, not a counter: a revised snapshot that walks the plan backwards has
   * to be believed. An implementation that advanced on each event would report
   * the high-water mark forever.
   */
  it('refolds a revised plan snapshot instead of advancing past it', () => {
    const projected = project([
      ...threadBootstrapEvents(),
      turnStartEvent('turn-1', requestedAt),
      planActivity('activity-plan-1', [
        { status: 'completed', step: 'Read the code' },
        { status: 'completed', step: 'Run the tests' },
        { status: 'inProgress', step: 'Write the report' },
      ]),
      planActivity(
        'activity-plan-1',
        [
          { status: 'completed', step: 'Read the code' },
          { status: 'inProgress', step: 'Run the tests' },
          { status: 'pending', step: 'Write the report' },
        ],
        'turn-1',
        revisedAt,
      ),
    ])

    expect(projected.shell?.planProgress).toMatchObject({
      completedSteps: 1,
      step: 'Run the tests',
    })
    expectPlanProgressConverges(projected)
  })

  it.each([
    { plan: [], reason: 'withdrawn' },
    { plan: [{ status: 'completed', step: 'Read the code' }], reason: 'finished' },
  ])('narrates nothing once the plan is $reason', ({ plan }) => {
    const projected = project([
      ...threadBootstrapEvents(),
      turnStartEvent('turn-1', requestedAt),
      planActivity('activity-plan-1', [{ status: 'inProgress', step: 'Read the code' }]),
      planActivity('activity-plan-2', plan, 'turn-1', revisedAt),
    ])

    expect(projected.shell?.planProgress).toBeNull()
    expectPlanProgressConverges(projected)
  })

  it('falls back to the retained turn when a revert prunes the planning turn', () => {
    const projected = project([
      ...threadBootstrapEvents(),
      turnStartEvent('turn-1', requestedAt),
      planActivity('activity-plan-1', [
        { status: 'completed', step: 'Read the code' },
        { status: 'inProgress', step: 'Sketch the fix' },
      ]),
      turnDiffCompletedEvent({ checkpointTurnCount: 1, turnId: 'turn-1' }),
      turnStartEvent('turn-2', startedAt),
      planActivity(
        'activity-plan-2',
        [{ status: 'inProgress', step: 'Run the tests' }],
        'turn-2',
        startedAt,
      ),
      turnDiffCompletedEvent({ checkpointTurnCount: 2, turnId: 'turn-2' }),
      pendingEvent(
        'thread.reverted',
        { revertedAt: settledAt, threadId: THREAD_ID, turnCount: 1 },
        settledAt,
      ),
    ])

    expect(projected.shell?.planProgress).toEqual({
      completedSteps: 1,
      step: 'Sketch the fix',
      totalSteps: 2,
      turnId: 'turn-1',
    })
    expectPlanProgressConverges(projected)
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
  it('carries project scripts through both read models, and lets an empty list clear them', () => {
    const scripts = [
      { command: 'bun run dev', name: 'dev' },
      { command: 'bun --bun vitest run', name: 'test' },
    ]

    expect(projectScripts(projectMeta({ scripts }))).toEqual({ memory: scripts, sql: scripts })
    // Absent is "unchanged" and empty is "the user removed them all". A patch
    // helper that folds `[]` into null would make clearing the list impossible.
    expect(projectScripts(projectMeta({ scripts }, { title: 'Renamed' }))).toEqual({
      memory: scripts,
      sql: scripts,
    })
    expect(projectScripts(projectMeta({ scripts }, { scripts: [] }))).toEqual({
      memory: [],
      sql: [],
    })
  })
  it('keeps a project rename from clobbering its scripts, and the reverse', () => {
    const scripts = [{ command: 'bun run dev', name: 'dev' }]

    // The projection patches compactly, so a command that names only one field
    // must leave the others exactly as they were. This is what makes a rename
    // and a script edit two independent actions rather than a last-writer-wins
    // race between two dialogs.
    const renamed = projectMeta({ scripts }, { title: 'Renamed' })
    expect(projectScripts(renamed)).toEqual({ memory: scripts, sql: scripts })
    expect(renamed.shell?.title).toBe('Renamed')

    const rescripted = projectMeta({ title: 'Renamed' }, { scripts })
    expect(rescripted.shell?.title).toBe('Renamed')
    expect(projectScripts(rescripted)).toEqual({ memory: scripts, sql: scripts })
  })
})

/** One or more `project.meta-updated` events over a bootstrapped project. */
function projectMeta(...updates: ReadonlyArray<Record<string, unknown>>) {
  return projectProject([
    ...threadBootstrapEvents(),
    ...updates.map((update, index) =>
      pendingEvent(
        'project.meta-updated',
        { projectId: PROJECT_ID, ...update, updatedAt: `2026-05-24T00:0${index + 1}:00.000Z` },
        `2026-05-24T00:0${index + 1}:00.000Z`,
      ),
    ),
  ])
}

function projectScripts(projected: ReturnType<typeof projectProject>) {
  return {
    memory: projected.memory?.scripts ?? null,
    // The shell reader, not the row: a column nobody reads back is not projected.
    sql: projected.shell?.scripts ?? null,
  }
}

function projectProject(events: PendingOrchestrationEvent[]) {
  const fixture = createProjectionFixture()
  fixtures.push(fixture)

  const appended = fixture.append(events)
  fixture.pipeline.applyEvents(appended)
  const reader = createShellRowReader(fixture.snapshots, fixture.database)
  reader.beginWindow()

  return {
    memory: projectEvents(appended).projects.get(PROJECT_ID),
    shell: reader.projectShell(PROJECT_ID),
  }
}

function project(events: PendingOrchestrationEvent[]) {
  const fixture = createProjectionFixture()
  fixtures.push(fixture)

  const appended = fixture.append(events)
  fixture.pipeline.applyEvents(appended)
  // The production reader, not a hand-read column: a projected field only counts
  // once the delta a rail row actually receives carries it.
  const reader = createShellRowReader(fixture.snapshots, fixture.database)
  reader.beginWindow()

  return {
    memory: projectedThread(projectEvents(appended)),
    shell: reader.threadShell(THREAD_ID),
    sqlThread: projectedThread(fixture.snapshots.fullReadModel()),
  }
}

/**
 * The projected column against the same fold run over each read model's own
 * retained activities. Asserting only the column is how a projection that
 * forgets to refold — after a revert, say — ships looking correct.
 */
function expectPlanProgressConverges(projected: ReturnType<typeof project>) {
  expect(projected.shell?.planProgress ?? null).toEqual(
    threadPlanProgress(projected.memory.activities),
  )
  expect(projected.shell?.planProgress ?? null).toEqual(
    threadPlanProgress(projected.sqlThread.activities),
  )
}

function planActivity(
  id: string,
  plan: ReadonlyArray<{ status: string; step: string }>,
  turnId = 'turn-1',
  createdAt?: string,
) {
  return activityAppendedEvent({
    createdAt,
    id,
    kind: 'turn.plan.updated',
    payload: { explanation: null, plan },
    summary: 'Plan updated',
    tone: 'thinking',
    turnId,
  })
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
