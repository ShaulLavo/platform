import { useEffect, useState } from 'react'

/**
 * False until `delayMs` has elapsed. A query that resolves in 40ms would
 * otherwise flash a skeleton for a frame or two, which reads as jank rather
 * than as loading.
 */
function useDelayedVisible(delayMs: number): boolean {
  const [elapsed, setElapsed] = useState(false)

  useEffect(() => {
    if (delayMs <= 0) return

    const timer = setTimeout(() => setElapsed(true), delayMs)
    return () => clearTimeout(timer)
  }, [delayMs])

  return delayMs <= 0 || elapsed
}

export { useDelayedVisible }
