import { create } from 'zustand'

/**
 * A shared, slowly-advancing "now" for labels that age.
 *
 * A store rather than a `Date.now()` read in render, because this app compiles
 * every component with the React Compiler: an in-render `Date.now()` lands
 * inside a memo scope keyed on the surrounding props, so a relative label is
 * computed once and then frozen for exactly the rows it exists to describe —
 * the idle ones nothing else re-keys. Reading the clock from state puts it in
 * the memo key, which is what makes the label move.
 *
 * One interval for the whole app, refcounted, at a resolution the labels
 * actually have: nothing renders seconds, so a minute is as often as any of
 * them can change.
 */
export const COARSE_CLOCK_INTERVAL_MS = 60_000

type CoarseClockStore = {
  nowMs: number
}

export const useCoarseClockStore = create<CoarseClockStore>(() => ({
  nowMs: Date.now(),
}))

let subscribers = 0
let intervalId: ReturnType<typeof setInterval> | null = null

/**
 * Keeps the shared clock ticking for as long as at least one caller needs it.
 * Returns the release function; the interval stops when the last one lets go,
 * so a workspace with no aging labels on screen burns no timer.
 */
export function retainCoarseClock() {
  subscribers += 1
  if (subscribers === 1) {
    // Stamped immediately: a clock that resumed after being idle would
    // otherwise hand out the time it stopped at until the first tick.
    useCoarseClockStore.setState({ nowMs: Date.now() })
    intervalId = setInterval(
      () => useCoarseClockStore.setState({ nowMs: Date.now() }),
      COARSE_CLOCK_INTERVAL_MS,
    )
  }

  let released = false

  return () => {
    if (released) return

    released = true
    subscribers -= 1
    if (subscribers > 0 || intervalId === null) return

    clearInterval(intervalId)
    intervalId = null
  }
}

/** Test seam: advances the shared clock without waiting a real minute. */
export function setCoarseClockNow(nowMs: number) {
  useCoarseClockStore.setState({ nowMs })
}
