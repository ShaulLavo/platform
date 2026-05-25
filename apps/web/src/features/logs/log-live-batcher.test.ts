import { describe, expect, it } from 'bun:test'
import type { LogEventSummary } from '@workspace/contracts'

import { createLiveEventBatcher } from './log-live-batcher'

describe('createLiveEventBatcher', () => {
  it('flushes multiple pushed events as one batch', () => {
    let scheduledFlush: (() => void) | null = null
    const batches: string[][] = []
    const batcher = createLiveEventBatcher(
      (events) => batches.push(events.map((event) => event.id)),
      (flush) => {
        scheduledFlush = flush

        return () => {
          scheduledFlush = null
        }
      },
    )

    batcher.push(event('a'))
    batcher.push(event('b'))

    expect(batches).toEqual([])
    scheduledFlush?.()
    expect(batches).toEqual([['a', 'b']])
  })

  it('drops pending events when canceled', () => {
    let scheduledFlush: (() => void) | null = null
    const batches: string[][] = []
    const batcher = createLiveEventBatcher(
      (events) => batches.push(events.map((event) => event.id)),
      (flush) => {
        scheduledFlush = flush

        return () => {
          scheduledFlush = null
        }
      },
    )

    batcher.push(event('a'))
    batcher.cancel()
    scheduledFlush?.()

    expect(batches).toEqual([])
  })
})

function event(id: string): LogEventSummary {
  return {
    action: null,
    area: null,
    durationMs: null,
    environment: null,
    errorCode: null,
    errorMessage: null,
    errorName: null,
    id,
    level: 'info',
    message: null,
    method: null,
    operation: null,
    outcome: null,
    path: null,
    requestId: null,
    service: null,
    source: null,
    status: null,
    threadId: null,
    timestamp: '2026-05-25T10:00:00.000Z',
  }
}
