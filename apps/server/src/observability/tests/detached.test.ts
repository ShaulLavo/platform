import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { WideEvent } from 'evlog'
import { readFsLogs } from 'evlog/fs'
import { afterEach, describe, expect, it } from 'vitest'

import { runDetached } from '../detached'
import { flushObservability, initializeObservability, resetObservabilityForTests } from '../runtime'

const roots: string[] = []

afterEach(async () => {
  await resetObservabilityForTests()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('runDetached', () => {
  it('records a wide warn event when detached work rejects', async () => {
    const logDir = await fixtureRoot()
    initializeObservability(testObservabilityEnv(logDir))

    runDetached(() => Promise.reject(new Error('detached boom')), {
      area: 'settings',
      operation: 'reload',
    })

    const events = await flushedEvents(logDir)
    expect(eventForAction(events, 'detached.failed')).toMatchObject({
      area: 'settings',
      error: { message: 'detached boom', name: 'Error' },
      level: 'warn',
      operation: 'reload',
    })
  })

  it('records nothing when detached work resolves', async () => {
    const logDir = await fixtureRoot()
    initializeObservability(testObservabilityEnv(logDir))

    runDetached(() => Promise.resolve('ok'), { area: 'settings', operation: 'reload' })

    const events = await flushedEvents(logDir)
    expect(events.some((event) => event.action === 'detached.failed')).toBe(false)
  })
})

// Helpers below are copied from `runtime.test.ts`. Keep them identical so the
// two files stay comparable.
function testObservabilityEnv(logDir: string, overrides: Record<string, string> = {}) {
  return {
    OBSERVABILITY_CONSOLE: 'false',
    OBSERVABILITY_DIR: logDir,
    OBSERVABILITY_ENABLED: 'true',
    OBSERVABILITY_INFO_SAMPLE_RATE: '100',
    NODE_ENV: 'production',
    ...overrides,
  }
}

async function fixtureRoot() {
  const root = await mkdtemp(path.join(tmpdir(), 'platform-observability-'))
  roots.push(root)
  return root
}

async function flushedEvents(logDir: string) {
  await delay(0)
  await flushObservability()
  return readEvents(logDir)
}

async function readEvents(logDir: string) {
  const events: WideEvent[] = []

  for await (const event of readFsLogs({ dir: logDir })) {
    events.push(event)
  }

  return events
}

function eventForAction(events: readonly WideEvent[], action: string) {
  const event = events.find((candidate) => candidate.action === action)
  if (!event) throw new Error(`missing observability event for ${action}`)

  return event as WideEvent & Record<string, unknown>
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
