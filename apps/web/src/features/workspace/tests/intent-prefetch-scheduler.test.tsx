import { createIdleScheduler } from '@/features/workspace/utils/intent-prefetch-scheduler'
import { expect, test } from '../../../../test/fixtures'

const NEVER_IDLE: IdleDeadline = { didTimeout: true, timeRemaining: () => 0 }

/** Stands in for the browser's idle queue so a test can decide when idle happens. */
function stubIdleQueue() {
  const original = {
    request: window.requestIdleCallback,
    cancel: window.cancelIdleCallback,
  }
  const pending = new Map<number, IdleRequestCallback>()
  let nextHandle = 1

  window.requestIdleCallback = (callback: IdleRequestCallback) => {
    const handle = nextHandle++
    pending.set(handle, callback)
    return handle
  }
  window.cancelIdleCallback = (handle: number) => {
    pending.delete(handle)
  }

  return {
    pending,
    flush: () => {
      const callbacks = [...pending.values()]
      pending.clear()
      for (const callback of callbacks) callback(NEVER_IDLE)
    },
    restore: () => {
      window.requestIdleCallback = original.request
      window.cancelIdleCallback = original.cancel
    },
  }
}

test('a burst of requests costs one idle callback', () => {
  const idle = stubIdleQueue()
  let runs = 0
  const schedule = createIdleScheduler(() => {
    runs += 1
  })

  try {
    schedule.request()
    schedule.request()
    schedule.request()

    expect(idle.pending.size).toBe(1)
    expect(runs).toBe(0)

    idle.flush()
    expect(runs).toBe(1)
  } finally {
    idle.restore()
  }
})

test('a request can be taken back before the browser goes idle', () => {
  const idle = stubIdleQueue()
  let runs = 0
  const schedule = createIdleScheduler(() => {
    runs += 1
  })

  try {
    schedule.request()
    schedule.cancel()
    idle.flush()

    expect(runs).toBe(0)
  } finally {
    idle.restore()
  }
})

test('the next request is scheduled again once the last one has run', () => {
  const idle = stubIdleQueue()
  let runs = 0
  const schedule = createIdleScheduler(() => {
    runs += 1
  })

  try {
    schedule.request()
    idle.flush()
    schedule.request()
    idle.flush()

    expect(runs).toBe(2)
  } finally {
    idle.restore()
  }
})
