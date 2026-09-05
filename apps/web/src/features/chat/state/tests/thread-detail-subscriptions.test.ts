import {
  threadIdSchema,
  type ClientOrchestrationCommand,
  type OrchestrationReplayEventsInput,
  type OrchestrationReplayEventsResult,
  type OrchestrationShellStreamItem,
  type OrchestrationThreadDetailSnapshot,
  type OrchestrationThreadStreamItem,
  type ThreadId,
} from '@workspace/contracts'
import { beforeEach, describe } from 'vitest'
import * as v from 'valibot'

import { createClientError } from '@/lib/structured-errors'
import { expect, test } from '../../../../../test/fixtures'
import { unsupportedChatTransport } from '../../../../../test/factories/chat-transport'
import { shellSnapshot, threadShell } from '../../../../../test/factories/chat'
import { useChatProjectionStore } from '../chat-projection-store'
import { selectThreadDetailSync, useThreadDetailSyncStore } from '../thread-detail-sync-store'
import { createThreadDetailSubscriptionCache } from '../thread-detail-subscriptions'

type ScriptedAttempt = {
  /** Thrown after the attempt's items. Omit to hang until aborted. */
  fail?: unknown
  items?: OrchestrationThreadStreamItem[]
}

describe('thread detail subscription cache', () => {
  beforeEach(() => {
    useChatProjectionStore.getState().resetChatProjection()
    useThreadDetailSyncStore.setState({ syncByThreadId: {} })
  })

  test('retains one active stream per thread and evicts after final release', async () => {
    const fake = createFakeEnvironment()
    const timers = createManualTimers()
    const cache = createThreadDetailSubscriptionCache({
      transport: fake.transport,
      scheduleTimeout: timers.schedule,
      clearScheduledTimeout: timers.clear,
    })
    const threadId = parseThreadId('thread-1')

    const releaseFirst = cache.retain(threadId)
    const releaseSecond = cache.retain(threadId)

    expect(fake.attempts.map((attempt) => attempt.threadId)).toEqual([threadId])
    expect(cache.snapshot()[0]?.refCount).toBe(2)

    releaseFirst()
    expect(cache.snapshot()[0]?.refCount).toBe(1)
    expect(timers.size()).toBe(0)

    releaseSecond()
    expect(cache.snapshot()[0]?.refCount).toBe(0)
    expect(timers.size()).toBe(1)
    await tick()
    expect(fake.aborts).toEqual([])

    timers.runAll()
    await tick()

    expect(cache.size()).toBe(0)
    expect(fake.aborts).toEqual([threadId])

    cache.disposeAll()
  })

  test('protects running and actionable threads from idle eviction', () => {
    const fake = createFakeEnvironment()
    const timers = createManualTimers()
    const cache = createThreadDetailSubscriptionCache({
      transport: fake.transport,
      scheduleTimeout: timers.schedule,
      clearScheduledTimeout: timers.clear,
    })
    const threadId = parseThreadId('thread-1')

    // The shared factory thread is mid-run, which is exactly the protected shape.
    useChatProjectionStore
      .getState()
      .syncShellSnapshot(shellSnapshot({ threads: [threadShell({ id: threadId })] }))

    const release = cache.retain(threadId)
    release()

    expect(cache.size()).toBe(1)
    expect(cache.snapshot()[0]?.hasEvictionTimer).toBe(false)
    expect(timers.size()).toBe(0)

    cache.disposeAll()
  })

  test('evicts the oldest idle entries when the cache exceeds capacity', async () => {
    const fake = createFakeEnvironment()
    const cache = createThreadDetailSubscriptionCache({
      transport: fake.transport,
      maxCachedSubscriptions: 2,
      now: incrementingClock(),
    })
    const firstThreadId = parseThreadId('thread-1')
    const secondThreadId = parseThreadId('thread-2')
    const thirdThreadId = parseThreadId('thread-3')

    cache.retain(firstThreadId)()
    cache.retain(secondThreadId)()
    cache.retain(thirdThreadId)()

    await tick()

    expect(cache.size()).toBe(2)
    expect(cache.snapshot().map((entry) => entry.threadId)).toEqual([secondThreadId, thirdThreadId])
    expect(fake.aborts).toEqual([firstThreadId])

    cache.disposeAll()
  })

  test('reconnects after a stream error and resumes from the applied sequence', async () => {
    const threadId = parseThreadId('thread-1')
    const fake = createFakeEnvironment([
      {
        fail: streamFailure(),
        items: [{ kind: 'snapshot', snapshot: detailSnapshot(threadId, 7) }],
      },
    ])
    const timers = createManualTimers()
    const cache = createThreadDetailSubscriptionCache({
      transport: fake.transport,
      scheduleTimeout: timers.schedule,
      clearScheduledTimeout: timers.clear,
    })

    cache.retain(threadId)
    await tick()

    expect(cache.snapshot()[0]?.status).toBe('reconnecting')
    expect(timers.delays()).toEqual([250])

    timers.runAll()
    await tick()

    expect(fake.attempts.map((attempt) => attempt.afterSequence)).toEqual([0, 7])
    expect(cache.snapshot()[0]?.active).toBe(true)

    cache.disposeAll()
  })

  test('climbs the backoff ladder while every attempt keeps failing', async () => {
    const threadId = parseThreadId('thread-1')
    const fake = createFakeEnvironment([
      { fail: streamFailure() },
      { fail: streamFailure() },
      { fail: streamFailure() },
    ])
    const timers = createManualTimers()
    const cache = createThreadDetailSubscriptionCache({
      transport: fake.transport,
      scheduleTimeout: timers.schedule,
      clearScheduledTimeout: timers.clear,
    })

    cache.retain(threadId)
    await tick()
    timers.runAll()
    await tick()
    timers.runAll()
    await tick()

    expect(timers.scheduled()).toEqual([250, 500, 1_000])
    expect(fake.attempts).toHaveLength(3)
    expect(cache.snapshot()[0]?.attempt).toBe(3)

    cache.disposeAll()
  })

  test('stops retrying once the server rejects the subscription', async () => {
    const threadId = parseThreadId('thread-1')
    const fake = createFakeEnvironment([{ fail: unauthorizedFailure() }])
    const timers = createManualTimers()
    const cache = createThreadDetailSubscriptionCache({
      transport: fake.transport,
      scheduleTimeout: timers.schedule,
      clearScheduledTimeout: timers.clear,
    })

    cache.retain(threadId)
    await tick()

    expect(fake.attempts).toHaveLength(1)
    expect(timers.size()).toBe(0)
    expect(cache.snapshot()[0]?.status).toBe('blocked')
    expect(cache.snapshot()[0]?.error).toBe('Subscription rejected.')

    timers.runAll()
    await tick()

    expect(fake.attempts).toHaveLength(1)

    cache.disposeAll()
  })

  test('disposes a thread that leaves the projection', async () => {
    const threadId = parseThreadId('thread-1')
    const fake = createFakeEnvironment()
    const cache = createThreadDetailSubscriptionCache({ transport: fake.transport })

    useChatProjectionStore
      .getState()
      .syncShellSnapshot(shellSnapshot({ threads: [threadShell({ id: threadId })] }))
    cache.retain(threadId)
    await tick()

    expect(cache.size()).toBe(1)

    useChatProjectionStore.getState().syncShellSnapshot({
      ...shellSnapshot({ threads: [] }),
      snapshotSequence: 2,
      updatedAt: '2026-05-28T00:00:09.000Z',
    })
    await tick()

    expect(cache.size()).toBe(0)
    expect(fake.aborts).toEqual([threadId])

    cache.disposeAll()
  })

  test('opens no stream for sidebar threads it was never asked to retain', async () => {
    const fake = createFakeEnvironment()
    const cache = createThreadDetailSubscriptionCache({ transport: fake.transport })
    const threads = Array.from({ length: 12 }, (_, index) =>
      threadShell({ id: parseThreadId(`thread-${index}`) }),
    )

    useChatProjectionStore.getState().syncShellSnapshot(shellSnapshot({ threads }))
    await tick()

    expect(fake.attempts).toEqual([])
    expect(cache.size()).toBe(0)

    cache.disposeAll()
  })

  test('publishes per-thread sync status for the UI and clears it on dispose', async () => {
    const threadId = parseThreadId('thread-1')
    const fake = createFakeEnvironment([
      { fail: streamFailure() },
      { items: [{ kind: 'snapshot', snapshot: detailSnapshot(threadId, 4) }] },
    ])
    const timers = createManualTimers()
    const cache = createThreadDetailSubscriptionCache({
      transport: fake.transport,
      scheduleTimeout: timers.schedule,
      clearScheduledTimeout: timers.clear,
    })

    cache.retain(threadId)
    await tick()

    expect(selectThreadDetailSync(useThreadDetailSyncStore.getState(), threadId)).toEqual({
      attempt: 1,
      error: 'Stream closed.',
      status: 'reconnecting',
    })

    timers.runAll()
    await tick()

    expect(selectThreadDetailSync(useThreadDetailSyncStore.getState(), threadId)).toEqual({
      attempt: 0,
      error: null,
      status: 'live',
    })

    cache.disposeAll()
    await tick()

    expect(selectThreadDetailSync(useThreadDetailSyncStore.getState(), threadId).status).toBe(
      'idle',
    )
  })

  test('treats stream traffic as access so the LRU keeps the busiest thread', async () => {
    const threadId = parseThreadId('thread-1')
    const clock = incrementingClock()
    const fake = createFakeEnvironment([
      { items: [{ kind: 'snapshot', snapshot: detailSnapshot(threadId, 3) }] },
    ])
    const cache = createThreadDetailSubscriptionCache({
      transport: fake.transport,
      now: clock,
    })

    cache.retain(threadId)
    const retainedAt = cache.snapshot()[0]?.lastAccessedAt ?? 0
    await tick()

    expect(cache.snapshot()[0]?.lastAccessedAt).toBeGreaterThan(retainedAt)

    cache.disposeAll()
  })
})

function createFakeEnvironment(script: ScriptedAttempt[] = []) {
  const attempts: Array<{ afterSequence: number | undefined; threadId: ThreadId }> = []
  const aborts: ThreadId[] = []

  const transport = unsupportedChatTransport({
    dispatchCommand: async (_command: ClientOrchestrationCommand) => ({
      deduped: false,
      sequence: 0,
    }),
    replayEvents: async (
      _input: OrchestrationReplayEventsInput,
    ): Promise<OrchestrationReplayEventsResult> => ({ events: [] }),
    shellStream: async function* (): AsyncGenerator<OrchestrationShellStreamItem> {
      const item = await new Promise<OrchestrationShellStreamItem>(() => undefined)

      yield item
    },
    threadDetailStream: async function* (threadId, input = {}) {
      const attempt = script[attempts.length] ?? {}
      attempts.push({ afterSequence: input.afterSequence, threadId })

      for (const item of attempt.items ?? []) {
        yield item
      }
      if (attempt.fail) throw attempt.fail

      await waitForAbort(input.signal)
      aborts.push(threadId)
    },
  })

  return { aborts, attempts, transport }
}

function waitForAbort(signal: AbortSignal | undefined) {
  return new Promise<void>((resolve) => {
    signal?.addEventListener('abort', () => resolve(), { once: true })
  })
}

function createManualTimers() {
  let nextId = 1
  const scheduled: number[] = []
  const timers = new Map<number, { callback: () => void; delay: number }>()

  return {
    clear: (handle: number | ReturnType<typeof setTimeout>) => {
      timers.delete(handle as unknown as number)
    },
    /** Delays of the timers still pending. */
    delays: () => [...timers.values()].map((timer) => timer.delay),
    runAll: () => {
      const pending = [...timers.values()]
      timers.clear()

      for (const timer of pending) {
        timer.callback()
      }
    },
    schedule: (callback: () => void, delay: number) => {
      const handle = nextId
      nextId += 1
      timers.set(handle, { callback, delay })
      scheduled.push(delay)

      return handle
    },
    /** Every delay ever scheduled, in order. */
    scheduled: () => scheduled,
    size: () => timers.size,
  }
}

function detailSnapshot(
  threadId: ThreadId,
  snapshotSequence: number,
): OrchestrationThreadDetailSnapshot {
  return {
    checkpoints: [],
    proposedPlans: [],
    snapshotSequence,
    thread: {
      ...threadShell({ id: threadId }),
      activities: [],
      deletedAt: null,
      messages: [],
    },
  }
}

function streamFailure() {
  return createClientError({
    code: 'ORCHESTRATION_WS_CLOSED',
    message: 'Stream closed.',
    status: 502,
    why: 'The test stream dropped mid-flight.',
    fix: 'Reconnect.',
  })
}

function unauthorizedFailure() {
  return createClientError({
    code: 'ORCHESTRATION_WS_UNAUTHORIZED',
    message: 'Subscription rejected.',
    status: 401,
    why: 'The test server refused the subscription.',
    fix: 'Sign in again.',
  })
}

function incrementingClock() {
  let value = 0

  return () => {
    value += 1

    return value
  }
}

async function tick() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function parseThreadId(value: string) {
  return v.parse(threadIdSchema, value)
}
