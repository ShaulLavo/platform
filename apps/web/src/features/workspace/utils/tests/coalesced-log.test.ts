import { afterEach, describe, expect, it, vi } from 'vitest'

import { createCoalescedLogQueue } from '@/features/workspace/utils/coalesced-log'

describe('createCoalescedLogQueue', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('coalesces repeated events with an optional merge function', () => {
    vi.useFakeTimers()
    const emitted: Record<string, unknown>[] = []
    const queue = createCoalescedLogQueue({
      delayMs: 100,
      emit: (event) => emitted.push(event),
      merge: (current, next) => ({
        latestPath: next.path,
        paths: [...pathsFromEvent(current), String(next.path)],
      }),
    })

    queue.queue('fs.tree', { path: 'apps' })
    queue.queue('fs.tree', { path: 'docs' })

    expect(emitted).toEqual([])

    vi.advanceTimersByTime(100)

    expect(emitted).toEqual([
      {
        coalescedCount: 2,
        latestPath: 'docs',
        paths: ['apps', 'docs'],
      },
    ])
  })
})

function pathsFromEvent(event: Record<string, unknown>) {
  if (Array.isArray(event.paths)) {
    return event.paths.filter((value): value is string => typeof value === 'string')
  }

  const path = event.path
  return typeof path === 'string' ? [path] : []
}
