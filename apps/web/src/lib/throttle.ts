export type Throttle = {
  cancel: () => void
  schedule: () => void
}

/**
 * Leading + trailing edge throttle. The first call after a quiet period runs
 * immediately; calls during the interval coalesce into one trailing run. Under
 * a continuous stream of calls it keeps firing once per interval, so it never
 * starves the way a debounce would.
 */
export function createThrottle(intervalMs: number, run: () => void): Throttle {
  let lastRunAt = Number.NEGATIVE_INFINITY
  let timeout: ReturnType<typeof setTimeout> | null = null

  const fire = () => {
    lastRunAt = Date.now()
    run()
  }

  return {
    cancel: () => {
      if (timeout === null) return

      clearTimeout(timeout)
      timeout = null
    },
    schedule: () => {
      if (timeout !== null) return

      const waitMs = lastRunAt + intervalMs - Date.now()
      if (waitMs <= 0) {
        fire()
        return
      }

      timeout = setTimeout(() => {
        timeout = null
        fire()
      }, waitMs)
    },
  }
}
