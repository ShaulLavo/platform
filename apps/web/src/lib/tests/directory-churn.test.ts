import { describe, expect, test } from 'vitest'

import { createDirectoryChurn } from '@/lib/directory-churn'

describe('createDirectoryChurn', () => {
  test('returns null before any directories are recorded', () => {
    const churn = createDirectoryChurn()

    expect(churn.summary()).toBeNull()
  })

  test('counts repeated directories and sorts the top entries by count', () => {
    const churn = createDirectoryChurn()
    churn.record(['src/a', 'src/b'])
    churn.record(['src/b'])
    churn.record(['src/b', 'src/c'])

    expect(churn.summary()).toEqual({
      evictedDirectoryCount: 0,
      topDirectories: [
        { count: 3, path: 'src/b' },
        { count: 1, path: 'src/a' },
        { count: 1, path: 'src/c' },
      ],
      trackedDirectoryCount: 3,
    })
  })

  test('limits the summary to the ten hottest directories', () => {
    const churn = createDirectoryChurn()
    for (let index = 0; index < 20; index += 1) {
      churn.record(Array.from({ length: index + 1 }, () => `dir-${index}`))
    }

    const summary = churn.summary()
    expect(summary?.topDirectories).toHaveLength(10)
    expect(summary?.topDirectories[0]).toEqual({ count: 20, path: 'dir-19' })
    expect(summary?.trackedDirectoryCount).toBe(20)
  })

  test('keeps hot directories exact when cold ones are evicted', () => {
    const churn = createDirectoryChurn(4)
    for (let index = 0; index < 20; index += 1) {
      churn.record(['hot', `cold-${index}`])
    }

    const summary = churn.summary()
    expect(summary?.topDirectories[0]).toEqual({ count: 20, path: 'hot' })
    expect(summary?.evictedDirectoryCount).toBeGreaterThan(0)
    expect(summary?.trackedDirectoryCount).toBeLessThanOrEqual(8)
  })
})
