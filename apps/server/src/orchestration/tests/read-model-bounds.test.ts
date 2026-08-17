import { afterEach, describe, expect, it } from 'vitest'
import { ORCHESTRATION_THREAD_DETAIL_PAGE_SIZE } from '@workspace/contracts'
import {
  MAX_THREAD_ACTIVITIES,
  MAX_THREAD_MESSAGES,
  type OrchestrationProjectedThread,
  type OrchestrationReadModel,
} from '../read-model'
import {
  activityAppendedEvent,
  applyIncrementally,
  createProjectionFixture,
  messageSentEvent,
  threadBootstrapEvents,
  THREAD_ID,
} from './factories/projection'

const fixtures: Array<{ close: () => void }> = []

afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    fixture.close()
  }
})

describe('in-memory read model bounds', () => {
  it('keeps only the newest messages and activities', () => {
    const fixture = createProjectionFixture()
    fixtures.push(fixture)

    let model = projectMessages(
      fixture,
      applyIncrementally(fixture, threadBootstrapEvents()),
      0,
      MAX_THREAD_MESSAGES + 500,
    )

    for (let index = 0; index < MAX_THREAD_ACTIVITIES + 100; index += 1) {
      const batch = fixture.append([activityAppendedEvent({ id: `event-activity-${index}` })])
      fixture.pipeline.applyEvents(batch)
      model = fixture.snapshots.refreshReadModel(model, batch)
    }

    const thread = projectedThread(model)

    expect(thread.messages).toHaveLength(MAX_THREAD_MESSAGES)
    expect(thread.messages.at(-1)?.id).toBe(`message-${MAX_THREAD_MESSAGES + 499}`)
    expect(thread.activities).toHaveLength(MAX_THREAD_ACTIVITIES)
    expect(thread.activities.at(-1)?.id).toBe(`event-activity-${MAX_THREAD_ACTIVITIES + 99}`)
  })

  it('refreshes the caller model in place instead of rebuilding it', () => {
    const fixture = createProjectionFixture()
    fixtures.push(fixture)

    const model = applyIncrementally(fixture, threadBootstrapEvents())
    const messages = projectedThread(model).messages

    const next = projectMessages(fixture, model, 1, 1)

    expect(next).toBe(model)
    expect(projectedThread(next).messages).toBe(messages)
  })

  /**
   * The regression this guards is that projecting one message used to *clone*
   * the retained messages, so dispatch cost grew with thread length (17x at 4k).
   *
   * It used to assert that as a wall-clock ratio, and that assertion failed
   * three times on a loaded machine while nowhere near 17x — a stopwatch shared
   * with fifteen other test files measures the machine, not the projector.
   * Widening the threshold twice would have been the second epicycle, so the
   * instrument changed instead: cloning is observable directly and exactly, as
   * object identity. A projector that copies cannot keep the references, and a
   * projector that keeps them cannot be copying — no timing, no flake, and it
   * fails on the actual defect rather than on a proxy for it.
   */
  it('does not copy the retained messages to project one more', () => {
    const fixture = createProjectionFixture()
    fixtures.push(fixture)

    const filled = projectMessages(
      fixture,
      applyIncrementally(fixture, threadBootstrapEvents()),
      0,
      400,
    )
    const before = projectedThread(filled).messages
    // Snapshotted as values: the projector appends in place, so the array
    // reference itself is not a stable "before" and asserting on its length
    // later would be reading the "after".
    const beforeCount = before.length
    const beforeHead = before.at(0)
    const beforeTail = before.at(-1)

    const after = projectMessages(fixture, filled, 400, 1)
    const afterMessages = projectedThread(after).messages

    // The same objects, not merely equal ones — `toBe` is the whole point.
    // Whether the array is reused or rebuilt is an implementation detail worth
    // leaving free; copying the *elements* is the defect.
    expect(afterMessages.at(0)).toBe(beforeHead)
    expect(afterMessages.at(-2)).toBe(beforeTail)
    expect(afterMessages).toHaveLength(beforeCount + 1)
  })

  it('hydrates only the newest rows when rebuilding the model from SQL', () => {
    const fixture = createProjectionFixture()
    fixtures.push(fixture)

    fixture.pipeline.applyEvents(fixture.append(threadBootstrapEvents()))
    for (let index = 0; index < MAX_THREAD_MESSAGES + 50; index += 1) {
      fixture.pipeline.applyEvents(
        fixture.append([
          messageSentEvent({
            createdAt: messageCreatedAt(index),
            messageId: `message-${index}`,
            streaming: false,
            text: 'hi',
          }),
        ]),
      )
    }

    const hydrated = projectedThread(fixture.snapshots.fullReadModel())

    expect(hydrated.messages).toHaveLength(MAX_THREAD_MESSAGES)
    expect(hydrated.messages.at(-1)?.id).toBe(`message-${MAX_THREAD_MESSAGES + 49}`)
    // The detail snapshot is a window, not the thread: everything older is a
    // `threadDetailPage` walk away, so nothing here is trimmed out of reach.
    const window = fixture.snapshots.threadDetailSnapshot(THREAD_ID).thread.messages
    expect(window).toHaveLength(ORCHESTRATION_THREAD_DETAIL_PAGE_SIZE)
    expect(window.at(-1)?.id).toBe(`message-${MAX_THREAD_MESSAGES + 49}`)
  })
})

/** One committed batch per message, which is the shape production dispatches. */
function projectMessages(
  fixture: ReturnType<typeof createProjectionFixture>,
  model: OrchestrationReadModel,
  offset: number,
  count: number,
) {
  let next = model

  for (let index = 0; index < count; index += 1) {
    const batch = fixture.append([
      messageSentEvent({ messageId: `message-${offset + index}`, streaming: false, text: 'hi' }),
    ])
    fixture.pipeline.applyEvents(batch)
    next = fixture.snapshots.refreshReadModel(next, batch)
  }

  return next
}

function messageCreatedAt(index: number) {
  return new Date(Date.UTC(2026, 4, 24) + index * 1000).toISOString()
}

function projectedThread(model: OrchestrationReadModel) {
  const thread = model.threads.get(THREAD_ID)
  expect(thread).toBeDefined()

  return thread as OrchestrationProjectedThread
}
