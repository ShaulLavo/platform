import { describe, expect, test, vi } from 'vitest'

const emitted: { fields: Record<string, unknown>; level: string }[] = []

vi.mock('evlog', () => ({
  log: {
    debug: (fields: Record<string, unknown>) => emitted.push({ fields, level: 'debug' }),
    error: (fields: Record<string, unknown>) => emitted.push({ fields, level: 'error' }),
    info: (fields: Record<string, unknown>) => emitted.push({ fields, level: 'info' }),
    warn: (fields: Record<string, unknown>) => emitted.push({ fields, level: 'warn' }),
  },
}))

import { recordClientLog } from '../client-ingest'

function ingestRequest(query = '') {
  return new Request(`http://localhost:3001/_log/ingest${query}`, { method: 'POST' })
}

function clientPayload() {
  return {
    action: 'app.bootstrap',
    area: 'app',
    level: 'info',
    timestamp: new Date().toISOString(),
  }
}

describe('recordClientLog', () => {
  test('stamps client.instanceId from the ingest URL instance param', () => {
    emitted.length = 0
    const result = recordClientLog(clientPayload(), ingestRequest('?instance=tab-a'))

    expect(result).toEqual({ ok: true })
    expect(emitted[0]?.fields.client).toMatchObject({ instanceId: 'tab-a' })
  })

  test('omits instanceId when the param is missing', () => {
    emitted.length = 0
    recordClientLog(clientPayload(), ingestRequest())

    expect(emitted[0]?.fields.client).not.toHaveProperty('instanceId')
  })

  test('caps oversized instance ids', () => {
    emitted.length = 0
    recordClientLog(clientPayload(), ingestRequest(`?instance=${'x'.repeat(200)}`))

    const client = emitted[0]?.fields.client as { instanceId: string }
    expect(client.instanceId).toHaveLength(64)
  })
})
