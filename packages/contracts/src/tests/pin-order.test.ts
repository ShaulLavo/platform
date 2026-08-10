import { describe, expect, it } from 'vitest'
import {
  generateSpreadPinOrderKeys,
  isValidPinOrderKey,
  pinOrderKeyBetween,
  planPinnedReorder,
  sortPinnedThreadsByOrderKey,
} from '../pin-order'

describe('pin order keys', () => {
  it('mints a key strictly between its neighbours', () => {
    const key = pinOrderKeyBetween('b', 'c')

    expect(key).not.toBeNull()
    expect(key! > 'b').toBe(true)
    expect(key! < 'c').toBe(true)
  })

  it('mints keys for the open bounds at either end of the block', () => {
    const top = pinOrderKeyBetween(null, 'b')
    const bottom = pinOrderKeyBetween('y', null)

    expect(top! < 'b').toBe(true)
    expect(bottom! > 'y').toBe(true)
  })

  it('keeps splitting the same gap forever without touching the neighbours', () => {
    let low = 'b'
    const high = 'c'

    for (let step = 0; step < 60; step += 1) {
      const key = pinOrderKeyBetween(low, high)
      expect(key).not.toBeNull()
      expect(key! > low).toBe(true)
      expect(key! < high).toBe(true)
      expect(isValidPinOrderKey(key!)).toBe(true)
      low = key!
    }
  })

  it('never mints a key that leaves no room before it', () => {
    const keys = [
      pinOrderKeyBetween(null, null),
      pinOrderKeyBetween(null, 'ab'),
      pinOrderKeyBetween('ab', 'b'),
      ...generateSpreadPinOrderKeys(12),
    ]

    for (const key of keys) {
      expect(key).not.toBeNull()
      expect(isValidPinOrderKey(key!)).toBe(true)
    }
  })

  it('refuses corrupt or inverted bounds instead of minting a key', () => {
    expect(pinOrderKeyBetween('c', 'b')).toBeNull()
    expect(pinOrderKeyBetween('b', 'b')).toBeNull()
    expect(pinOrderKeyBetween('B', 'c')).toBeNull()
    expect(pinOrderKeyBetween('ba', 'c')).toBeNull()
  })

  it('spreads a whole section into strictly increasing keys', () => {
    const keys = generateSpreadPinOrderKeys(25)

    expect(keys).toHaveLength(25)
    expect(keys.toSorted()).toEqual(keys)
    expect(new Set(keys).size).toBe(25)
  })
})

describe('planPinnedReorder', () => {
  const keyed = new Map([
    ['thread-a', 'b'],
    ['thread-b', 'd'],
    ['thread-c', 'f'],
  ])

  it('writes exactly one key to exactly one row for a drag between keyed rows', () => {
    const writes = planPinnedReorder({
      keysById: keyed,
      movedId: 'thread-c',
      orderedIds: ['thread-a', 'thread-c', 'thread-b'],
    })

    expect(writes).toHaveLength(1)
    expect(writes[0]?.id).toBe('thread-c')
    expect(writes[0]!.orderKey > 'b').toBe(true)
    expect(writes[0]!.orderKey < 'd').toBe(true)
  })

  it('writes one key when the drag lands at the top of the block', () => {
    const writes = planPinnedReorder({
      keysById: keyed,
      movedId: 'thread-c',
      orderedIds: ['thread-c', 'thread-a', 'thread-b'],
    })

    expect(writes).toHaveLength(1)
    expect(writes[0]!.orderKey < 'b').toBe(true)
  })

  it('respreads the section when a neighbour has no key to anchor on', () => {
    const writes = planPinnedReorder({
      keysById: new Map([['thread-a', 'b']]),
      movedId: 'thread-c',
      orderedIds: ['thread-a', 'thread-c', 'thread-b'],
    })

    expect(writes.map((write) => write.id)).toEqual(['thread-a', 'thread-c', 'thread-b'])
    expect(writes.map((write) => write.orderKey).toSorted()).toEqual(
      writes.map((write) => write.orderKey),
    )
  })

  it('plans nothing for a thread that is not in the order', () => {
    expect(planPinnedReorder({ keysById: keyed, movedId: 'thread-z', orderedIds: [] })).toEqual([])
  })
})

describe('sortPinnedThreadsByOrderKey', () => {
  it('orders keyed threads by plain string comparison and is stable under a drag', () => {
    const threads = [
      { createdAt: '2026-06-01T00:00:00.000Z', id: 'thread-c', pinOrderKey: 'f' },
      { createdAt: '2026-06-02T00:00:00.000Z', id: 'thread-a', pinOrderKey: 'b' },
      { createdAt: '2026-06-03T00:00:00.000Z', id: 'thread-b', pinOrderKey: 'd' },
    ]

    expect(sortPinnedThreadsByOrderKey(threads).map((thread) => thread.id)).toEqual([
      'thread-a',
      'thread-b',
      'thread-c',
    ])

    const [write] = planPinnedReorder({
      keysById: new Map(threads.map((thread) => [thread.id, thread.pinOrderKey])),
      movedId: 'thread-c',
      orderedIds: ['thread-a', 'thread-c', 'thread-b'],
    })
    const moved = threads.map((thread) =>
      thread.id === write?.id ? { ...thread, pinOrderKey: write.orderKey } : thread,
    )

    expect(sortPinnedThreadsByOrderKey(moved).map((thread) => thread.id)).toEqual([
      'thread-a',
      'thread-c',
      'thread-b',
    ])
  })

  it('parks keyless threads after the arranged run, newest created first', () => {
    const sorted = sortPinnedThreadsByOrderKey([
      { createdAt: '2026-06-01T00:00:00.000Z', id: 'thread-old', pinOrderKey: null },
      { createdAt: '2026-06-05T00:00:00.000Z', id: 'thread-new', pinOrderKey: null },
      { createdAt: '2026-06-03T00:00:00.000Z', id: 'thread-keyed', pinOrderKey: 'm' },
    ])

    expect(sorted.map((thread) => thread.id)).toEqual(['thread-keyed', 'thread-new', 'thread-old'])
  })

  it('breaks equal keys on id so two clients cannot disagree', () => {
    const sorted = sortPinnedThreadsByOrderKey([
      { createdAt: '2026-06-01T00:00:00.000Z', id: 'thread-b', pinOrderKey: 'm' },
      { createdAt: '2026-06-01T00:00:00.000Z', id: 'thread-a', pinOrderKey: 'm' },
    ])

    expect(sorted.map((thread) => thread.id)).toEqual(['thread-a', 'thread-b'])
  })
})
