import { afterEach } from 'vitest'

import {
  COARSE_CLOCK_INTERVAL_MS,
  retainCoarseClock,
  setCoarseClockNow,
  useCoarseClockStore,
} from '@/features/chat/state/coarse-clock-store'
import { expect, test } from '../../../../../test/fixtures'

const releases: Array<() => void> = []

afterEach(() => {
  for (const release of releases.splice(0)) {
    release()
  }
})

function retain() {
  const release = retainCoarseClock()
  releases.push(release)

  return release
}

test('the clock advances on its own once something is watching it', async () => {
  setCoarseClockNow(0)
  retain()

  const started = useCoarseClockStore.getState().nowMs
  // Stamped on retain rather than left at the value it stopped on, so a clock
  // that was idle does not hand out a stale "now" until its first tick.
  expect(started).toBeGreaterThan(0)

  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(useCoarseClockStore.getState().nowMs).toBeGreaterThanOrEqual(started)
})

test('one interval serves every watcher, and stops when the last one lets go', () => {
  const first = retain()
  const second = retain()

  first()
  setCoarseClockNow(1_000)
  // Still armed for the second watcher.
  expect(useCoarseClockStore.getState().nowMs).toBe(1_000)

  second()
  const idleAt = Date.now()

  // Nothing left to age a label for, so nothing should still be ticking. The
  // clock keeps its last value; only a new retain re-stamps it.
  expect(useCoarseClockStore.getState().nowMs).toBe(1_000)
  retain()
  expect(useCoarseClockStore.getState().nowMs).toBeGreaterThanOrEqual(idleAt)
})

test('releasing twice cannot drop the refcount below the watchers that remain', () => {
  const first = retainCoarseClock()
  retain()

  first()
  first()

  setCoarseClockNow(2_000)
  expect(useCoarseClockStore.getState().nowMs).toBe(2_000)
})

test('the resolution matches what the labels can actually show', () => {
  // Nothing renders seconds, so a faster tick would repaint rows for nothing.
  expect(COARSE_CLOCK_INTERVAL_MS).toBe(60_000)
})
