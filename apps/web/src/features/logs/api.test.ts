import { beforeEach, describe, expect, it, mock } from 'bun:test'

const summaryGet = mock()
const eventsGet = mock()
const eventGet = mock()
const liveGet = mock()

mock.module('@/lib/client', () => ({
  client: {
    _log: {
      dashboard: {
        event: { get: eventGet },
        events: { get: eventsGet },
        live: { get: liveGet },
        summary: { get: summaryGet },
      },
    },
  },
  serverUrl: 'http://localhost:3001',
}))

const api = await import('./api')

describe('logs api', () => {
  beforeEach(() => {
    for (const endpoint of [summaryGet, eventsGet, eventGet, liveGet]) {
      endpoint.mockReset()
    }
  })

  it('normalizes Eden Date values before validating dashboard responses', async () => {
    summaryGet.mockResolvedValueOnce({
      data: {
        actions: [],
        areas: [],
        durationP95Ms: null,
        errorCount: 0,
        firstTimestamp: new Date('2026-05-25T10:00:00.000Z'),
        generatedAt: new Date('2026-05-25T10:01:00.000Z'),
        lastTimestamp: new Date('2026-05-25T10:00:30.000Z'),
        levels: [],
        slowCount: 0,
        sources: [],
        timeline: [
          {
            end: new Date('2026-05-25T10:01:00.000Z'),
            error: 0,
            slow: 0,
            start: new Date('2026-05-25T10:00:00.000Z'),
            total: 1,
            warn: 0,
          },
        ],
        total: 1,
        warnCount: 0,
      },
    })

    const result = await api.fetchLogSummary({
      since: '2026-05-25T10:00:00.000Z',
      slowMs: 500,
    })

    expect(result.generatedAt).toBe('2026-05-25T10:01:00.000Z')
    expect(result.timeline[0].start).toBe('2026-05-25T10:00:00.000Z')
    expect(summaryGet).toHaveBeenCalledWith({
      fetch: { signal: undefined },
      query: {
        areas: undefined,
        levels: undefined,
        search: undefined,
        since: '2026-05-25T10:00:00.000Z',
        slowMs: 500,
        sources: undefined,
        until: undefined,
      },
    })
  })

  it('normalizes Eden Date values in event result timestamps', async () => {
    eventsGet.mockResolvedValueOnce({
      data: {
        events: [
          {
            action: 'git.status',
            area: 'git',
            durationMs: null,
            environment: null,
            errorCode: null,
            errorMessage: null,
            errorName: null,
            id: 'event-1',
            level: 'info',
            message: null,
            method: null,
            operation: null,
            outcome: null,
            path: null,
            requestId: null,
            service: null,
            source: 'client',
            status: null,
            threadId: null,
            timestamp: new Date('2026-05-25T10:02:00.000Z'),
          },
        ],
        nextCursor: null,
        total: 1,
      },
    })

    const result = await api.fetchLogEvents({})

    expect(result.events[0].timestamp).toBe('2026-05-25T10:02:00.000Z')
  })
})
