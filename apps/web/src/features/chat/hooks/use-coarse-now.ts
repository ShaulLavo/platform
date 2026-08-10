import { useEffect } from 'react'

import { retainCoarseClock, useCoarseClockStore } from '../state/coarse-clock-store'

/**
 * The shared coarse clock, for a row whose label ages. Subscribing is what puts
 * "now" in the component's memo key — see the store for why an in-render
 * `Date.now()` silently freezes under the React Compiler.
 */
export function useCoarseNow() {
  useEffect(retainCoarseClock, [])

  return useCoarseClockStore((state) => state.nowMs)
}
