import { describe, expect, it } from 'vitest'

import { createAddressProjection } from '@/features/address/state/projection'
import { emptyAddress, type Address } from '@/features/address/utils/grammar'

function harness() {
  const written: string[] = []
  const pushed: string[] = []
  let clock = 0
  const frames: (() => void)[] = []

  const projection = createAddressProjection({
    now: () => clock,
    schedule: (write) => frames.push(write),
    writer: {
      push: (href) => {
        written.push(href)
        pushed.push(href)
      },
      replace: (href) => written.push(href),
    },
  })

  return {
    advance: (ms: number) => {
      clock += ms
    },
    frame: () => {
      const queued = frames.splice(0, frames.length)
      for (const write of queued) write()
    },
    projection,
    pushed,
    written,
  }
}

function addressFor(workspace: string, document: string | null = null): Address {
  return { ...emptyAddress(), document, mode: 'workbench', workspace }
}

describe('the address projection', () => {
  it('coalesces a burst into one write per frame', () => {
    const { frame, projection, written } = harness()

    projection.project(addressFor('a'))
    projection.project(addressFor('b'))
    projection.project(addressFor('c'))
    expect(written).toEqual([])

    frame()
    expect(written).toEqual(['/~c/workbench'])
  })

  it('writes nothing when the address has not changed', () => {
    const { frame, projection, written } = harness()

    projection.project(addressFor('a'))
    frame()
    projection.project(addressFor('a'))
    frame()

    expect(written).toEqual(['/~a/workbench'])
  })

  // Safari throttles replaceState at ~100 calls / 30s and then throws. Degrading is
  // the whole point: after M4 the address is the only restore payload, so taking the
  // app down here would be worse than a stale URL.
  it('stops projecting once the rate budget trips, and says so', () => {
    const { frame, projection, written } = harness()

    for (let index = 0; index < 200; index += 1) {
      projection.project(addressFor(`w${index}`))
      frame()
    }

    expect(written.length).toBeLessThanOrEqual(90)
    expect(written.length).toBeGreaterThan(0)
  })

  it('refills the budget once the window rolls over', () => {
    const { advance, frame, projection, written } = harness()

    for (let index = 0; index < 95; index += 1) {
      projection.project(addressFor(`w${index}`))
      frame()
    }
    const beforeRollover = written.length

    advance(31_000)
    projection.resume()
    projection.project(addressFor('after'))
    frame()

    expect(written.length).toBe(beforeRollover + 1)
    expect(written.at(-1)).toBe('/~after/workbench')
  })

  // `resume` clears the latch, not the counter — otherwise key-repeat navigation would
  // reset the budget on every keypress and defeat the limit it exists for.
  it('resume alone cannot refill a spent budget', () => {
    const { advance, frame, projection, written } = harness()

    for (let index = 0; index < 200; index += 1) {
      projection.project(addressFor(`w${index}`))
      frame()
    }
    const throttledCount = written.length

    projection.resume()
    projection.project(addressFor('resumed'))
    frame()
    expect(written.length).toBe(throttledCount)

    advance(31_000)
    projection.project(addressFor('resumed'))
    frame()
    expect(written.at(-1)).toBe('/~resumed/workbench')
  })

  it('serializes the document token into the path', () => {
    const { frame, projection, written } = harness()

    projection.project(addressFor('platform', 'f/apps/web/src/main.tsx'))
    frame()

    expect(written).toEqual(['/~platform/workbench/f/apps/web/src/main.tsx'])
  })
})

describe('push versus replace, decided by slot', () => {
  it('replaces the first write — there is nothing to go back to yet', () => {
    const { frame, projection, pushed, written } = harness()

    projection.project(addressFor('a', 'f/x.ts'))
    frame()

    expect(written).toHaveLength(1)
    expect(pushed).toEqual([])
  })

  it('pushes when the document changes, so back returns to the previous one', () => {
    const { frame, projection, pushed } = harness()

    projection.project(addressFor('a', 'f/x.ts'))
    frame()
    projection.project(addressFor('a', 'f/y.ts'))
    frame()

    expect(pushed).toEqual(['/~a/workbench/f/y.ts'])
  })

  it('pushes on a workspace change', () => {
    const { frame, projection, pushed } = harness()

    projection.project(addressFor('a', 'f/x.ts'))
    frame()
    projection.project(addressFor('b', 'f/x.ts'))
    frame()

    expect(pushed).toEqual(['/~b/workbench/f/x.ts'])
  })

  // Six characters typed into search must not leave six history entries.
  it('replaces when only a panel or filter moves', () => {
    const { frame, projection, pushed, written } = harness()

    projection.project(addressFor('a', 'f/x.ts'))
    frame()
    projection.project({ ...addressFor('a', 'f/x.ts'), side: 'git' })
    frame()
    projection.project({ ...addressFor('a', 'f/x.ts'), search: { q: 'ab' }, side: 'git' })
    frame()

    expect(written).toHaveLength(3)
    expect(pushed).toEqual([])
  })

  // Otherwise a burst leaves the address dead for the rest of the session.
  it('a navigation earns another attempt but cannot refill the budget', () => {
    const { advance, frame, projection, written } = harness()

    for (let index = 0; index < 200; index += 1) {
      projection.project({ ...addressFor('a', 'f/x.ts'), side: index % 2 === 0 ? 'git' : 'files' })
      frame()
    }
    const throttledCount = written.length
    expect(throttledCount).toBeLessThanOrEqual(90)

    // Still inside the window: the latch clears, the cap still refuses.
    projection.project(addressFor('a', 'f/navigated.ts'))
    frame()
    expect(written.length).toBe(throttledCount)

    // The window rolls over on its own, and the address comes back.
    advance(31_000)
    projection.project(addressFor('a', 'f/navigated.ts'))
    frame()
    expect(written.at(-1)).toBe('/~a/workbench/f/navigated.ts')
  })
})
