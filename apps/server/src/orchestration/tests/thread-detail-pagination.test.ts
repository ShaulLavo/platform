import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  ORCHESTRATION_THREAD_DETAIL_PAGE_SIZE,
  type OrchestrationThreadDetailAnchor,
} from '@workspace/contracts'
import { OrchestrationEngine } from '../engine'
import type { OrchestrationSnapshotQuery } from '../snapshot-query'
import {
  activityAppendedEvent,
  createProjectionFixture,
  messageSentEvent,
  threadBootstrapEvents,
  THREAD_ID,
} from './factories/projection'

const MESSAGE_COUNT = 5_000
const ACTIVITY_COUNT = 320
const SEED_TIMEOUT_MS = 60_000

/**
 * Seeded once: every test here is a read, and re-projecting five thousand events
 * per test is what turns a pagination suite into a minute of wall clock. The
 * timeout is generous because the seed runs the real event store and projector,
 * which under a fully parallel suite is far slower than it is alone.
 */
let fixture: ReturnType<typeof createProjectionFixture>
let snapshots: OrchestrationSnapshotQuery

beforeAll(() => {
  fixture = createProjectionFixture()
  snapshots = fixture.snapshots
  fixture.pipeline.applyEvents(fixture.append(threadBootstrapEvents()))
  fixture.pipeline.applyEvents(
    fixture.append(
      Array.from({ length: MESSAGE_COUNT }, (_, index) =>
        messageSentEvent({
          createdAt: messageCreatedAt(index),
          messageId: messageId(index),
          streaming: false,
          text: `message ${index}`,
        }),
      ),
    ),
  )
  fixture.pipeline.applyEvents(
    fixture.append(
      Array.from({ length: ACTIVITY_COUNT }, (_, index) =>
        activityAppendedEvent({ createdAt: activityCreatedAt(index), id: activityId(index) }),
      ),
    ),
  )
}, SEED_TIMEOUT_MS)

afterAll(() => {
  fixture.close()
})

describe('thread detail pagination', () => {
  it('opens a five thousand message thread on a bounded window', () => {
    const detail = snapshots.threadDetailSnapshot(THREAD_ID)

    expect(detail.thread.messages).toHaveLength(ORCHESTRATION_THREAD_DETAIL_PAGE_SIZE)
    expect(detail.thread.messages.at(-1)?.id).toBe(messageId(MESSAGE_COUNT - 1))
    expect(detail.thread.messages.at(0)?.id).toBe(
      messageId(MESSAGE_COUNT - ORCHESTRATION_THREAD_DETAIL_PAGE_SIZE),
    )
    expect(detail.thread.activities).toHaveLength(ORCHESTRATION_THREAD_DETAIL_PAGE_SIZE)
  })

  it('walks backwards in order until the thread is exhausted, reaching every row', () => {
    const detail = snapshots.threadDetailSnapshot(THREAD_ID)
    const messages = detail.thread.messages.map((message) => message.id)
    const activities = detail.thread.activities.map((activity) => activity.id)
    let beforeMessage = anchorOf(detail.thread.messages[0])
    let beforeActivity = anchorOf(detail.thread.activities[0])
    let pages = 0

    while (pages < MESSAGE_COUNT) {
      const page = snapshots.threadDetailPage({
        beforeActivity,
        beforeMessage,
        threadId: THREAD_ID,
      })
      pages += 1
      expect(page.messages.length).toBeLessThanOrEqual(ORCHESTRATION_THREAD_DETAIL_PAGE_SIZE)
      messages.unshift(...page.messages.map((message) => message.id))
      activities.unshift(...page.activities.map((activity) => activity.id))
      beforeMessage = page.messages[0] ? anchorOf(page.messages[0]) : beforeMessage
      beforeActivity = page.activities[0] ? anchorOf(page.activities[0]) : beforeActivity
      if (!page.hasEarlier) break
    }

    // The walk terminated on `hasEarlier`, not on the loop guard.
    expect(pages).toBeLessThan(MESSAGE_COUNT)
    expect(messages).toEqual(Array.from({ length: MESSAGE_COUNT }, (_, index) => messageId(index)))
    expect(activities).toEqual(
      Array.from({ length: ACTIVITY_COUNT }, (_, index) => activityId(index)),
    )
  })

  it('reports no earlier rows once both streams reach the start of the thread', () => {
    const page = snapshots.threadDetailPage({
      beforeActivity: { createdAt: activityCreatedAt(5), id: activityId(5) },
      beforeMessage: { createdAt: messageCreatedAt(5), id: messageId(5) },
      limit: 10,
      threadId: THREAD_ID,
    })

    expect(page.messages.map((message) => message.id)).toEqual(
      Array.from({ length: 5 }, (_, index) => messageId(index)),
    )
    expect(page.activities.map((activity) => activity.id)).toEqual(
      Array.from({ length: 5 }, (_, index) => activityId(index)),
    )
    expect(page.hasEarlier).toBe(false)
  })

  it('keeps the message and activity walks on their own boundaries', () => {
    // Messages are exhausted while activities are not: the page must still
    // report more to come, or the activity tail would be stranded.
    const page = snapshots.threadDetailPage({
      beforeActivity: {
        createdAt: activityCreatedAt(ACTIVITY_COUNT - 1),
        id: activityId(ACTIVITY_COUNT - 1),
      },
      beforeMessage: { createdAt: messageCreatedAt(0), id: messageId(0) },
      limit: 10,
      threadId: THREAD_ID,
    })

    expect(page.messages).toHaveLength(0)
    expect(page.activities.map((activity) => activity.id)).toEqual(
      Array.from({ length: 10 }, (_, index) => activityId(ACTIVITY_COUNT - 11 + index)),
    )
    expect(page.hasEarlier).toBe(true)
  })

  it('rejects a page read for a thread that does not exist', () => {
    expect(() => snapshots.threadDetailPage({ threadId: 'thread-missing' })).toThrow()
  })

  it('is reachable from the engine, which is what the RPC method calls', () => {
    // The page query is only useful if something client-facing can reach it;
    // it spent a release complete and unexposed.
    const engine = new OrchestrationEngine(fixture.database, { providerRuntime: false })
    const page = engine.threadDetailPage({ limit: 3, threadId: THREAD_ID })

    expect(page.messages.map((message) => message.id)).toEqual(
      Array.from({ length: 3 }, (_, index) => messageId(MESSAGE_COUNT - 3 + index)),
    )
    expect(page.hasEarlier).toBe(true)
  })
})

function anchorOf(row: { createdAt: string; id: string } | undefined) {
  expect(row).toBeDefined()

  return { createdAt: row?.createdAt ?? '', id: row?.id ?? '' } as OrchestrationThreadDetailAnchor
}

/** Zero padded so the id tiebreak orders the same way the index does. */
function messageId(index: number) {
  return `message-${String(index).padStart(5, '0')}`
}

function activityId(index: number) {
  return `activity-${String(index).padStart(5, '0')}`
}

function messageCreatedAt(index: number) {
  return new Date(Date.UTC(2026, 4, 24) + index * 1000).toISOString()
}

function activityCreatedAt(index: number) {
  return new Date(Date.UTC(2026, 4, 25) + index * 1000).toISOString()
}
