import { afterEach, describe, expect, it, vi } from 'vitest'

import { createThrottle } from '@/lib/throttle'

describe('createThrottle', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('runs immediately on the leading edge', () => {
    vi.useFakeTimers()
    const runs = vi.fn()
    const throttle = createThrottle(2_000, runs)

    throttle.schedule()

    expect(runs).toHaveBeenCalledTimes(1)
  })

  it('coalesces calls inside the interval into one trailing run', () => {
    vi.useFakeTimers()
    const runs = vi.fn()
    const throttle = createThrottle(2_000, runs)

    throttle.schedule()
    throttle.schedule()
    throttle.schedule()
    expect(runs).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(2_000)
    expect(runs).toHaveBeenCalledTimes(2)
  })

  it('keeps firing once per interval under a continuous stream of calls', () => {
    vi.useFakeTimers()
    const runs = vi.fn()
    const throttle = createThrottle(2_000, runs)

    for (let elapsed = 0; elapsed < 10_000; elapsed += 250) {
      throttle.schedule()
      vi.advanceTimersByTime(250)
    }

    expect(runs).toHaveBeenCalledTimes(6)
  })

  it('runs on the leading edge again after a quiet period', () => {
    vi.useFakeTimers()
    const runs = vi.fn()
    const throttle = createThrottle(2_000, runs)

    throttle.schedule()
    vi.advanceTimersByTime(5_000)
    throttle.schedule()

    expect(runs).toHaveBeenCalledTimes(2)
  })

  it('cancel drops a pending trailing run', () => {
    vi.useFakeTimers()
    const runs = vi.fn()
    const throttle = createThrottle(2_000, runs)

    throttle.schedule()
    throttle.schedule()
    throttle.cancel()
    vi.advanceTimersByTime(10_000)

    expect(runs).toHaveBeenCalledTimes(1)
  })
})
