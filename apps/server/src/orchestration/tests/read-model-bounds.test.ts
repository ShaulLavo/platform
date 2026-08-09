import { afterEach, describe, expect, it } from 'vitest'
import { projectEvents } from '../projector'
import {
  MAX_THREAD_ACTIVITIES,
  MAX_THREAD_MESSAGES,
  type OrchestrationProjectedThread,
  type OrchestrationReadModel,
} from '../read-model'
import {
  activityAppendedEvent,
  createProjectionFixture,
  messageSentEvent,
  threadBootstrapEvents,
  withSequences,
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
    const filled = projectMessages(
      projectEvents(withSequences(threadBootstrapEvents())),
      0,
      MAX_THREAD_MESSAGES + 500,
    )
    let model = filled.model

    for (let index = 0; index < MAX_THREAD_ACTIVITIES + 100; index += 1) {
      model = projectEvents(
        withSequences([activityAppendedEvent({ id: `event-activity-${index}` })]),
        model,
      )
    }

    const thread = projectedThread(model)

    expect(thread.messages).toHaveLength(MAX_THREAD_MESSAGES)
    expect(thread.messages.at(-1)?.id).toBe(`message-${MAX_THREAD_MESSAGES + 499}`)
    expect(thread.activities).toHaveLength(MAX_THREAD_ACTIVITIES)
    expect(thread.activities.at(-1)?.id).toBe(`event-activity-${MAX_THREAD_ACTIVITIES + 99}`)
  })

  it('projects into the caller model instead of cloning it per event', () => {
    const model = projectEvents(withSequences(threadBootstrapEvents()))
    const messages = projectedThread(model).messages

    const next = projectEvents(
      withSequences([messageSentEvent({ messageId: 'message-1', streaming: false, text: 'hi' })]),
      model,
    )

    expect(next).toBe(model)
    expect(projectedThread(next).messages).toBe(messages)
  })

  it('does not let dispatch cost grow with thread length', () => {
    // Warm the projector first: a cold first window measures the JIT, not the
    // projection, and that inflated baseline hides real growth.
    const warm = projectMessages(projectEvents(withSequences(threadBootstrapEvents())), 0, 400)
    const early = projectMessages(warm.model, 500, 400)
    const filled = projectMessages(early.model, 1_000, 4_000)
    const late = projectMessages(filled.model, 10_000, 400)

    // Cloning made this ratio grow without bound (measured 17x at 4k messages).
    // The floor keeps a fast machine's noise from turning a microsecond
    // baseline into an impossible bar.
    expect(late.averageMs).toBeLessThan(Math.max(early.averageMs, 0.003) * 5)
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
    expect(fixture.snapshots.threadDetailSnapshot(THREAD_ID).thread.messages).toHaveLength(
      MAX_THREAD_MESSAGES + 50,
    )
  })
})

/** Threads the returned model so the measurement holds whatever projection semantics ship. */
function projectMessages(model: OrchestrationReadModel, offset: number, count: number) {
  const events = Array.from({ length: count }, (_, index) =>
    withSequences([
      messageSentEvent({ messageId: `message-${offset + index}`, streaming: false, text: 'hi' }),
    ]),
  )
  const startedAt = performance.now()
  let next = model

  for (const batch of events) {
    next = projectEvents(batch, next)
  }

  return { averageMs: (performance.now() - startedAt) / count, model: next }
}

function messageCreatedAt(index: number) {
  return new Date(Date.UTC(2026, 4, 24) + index * 1000).toISOString()
}

function projectedThread(model: OrchestrationReadModel) {
  const thread = model.threads.get(THREAD_ID)
  expect(thread).toBeDefined()

  return thread as OrchestrationProjectedThread
}
