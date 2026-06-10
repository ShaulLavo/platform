import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  initializeObservabilityRuntime,
  isObservabilityActive,
  recordObservabilityInfo,
  resetObservabilityForTests,
} from '../runtime'

afterEach(async () => {
  await resetObservabilityForTests()
})

describe('observability runtime', () => {
  it('uses OBSERVABILITY_ENABLED as the master off switch', () => {
    const runtime = initializeObservabilityRuntime({
      env: {
        NODE_ENV: 'production',
        OBSERVABILITY_CONSOLE: 'true',
        OBSERVABILITY_ENABLED: 'false',
        OBSERVABILITY_POSTHOG_ENABLED: 'true',
        POSTHOG_API_KEY: 'phc_test',
      },
      source: 'test',
    })

    recordObservabilityInfo('test.disabled')

    expect(runtime.config.enabled).toBe(false)
    expect(runtime.drain).toBeNull()
    expect(isObservabilityActive()).toBe(false)
  })

  it('resolves relative log dirs from the monorepo root', async () => {
    const cwd = process.cwd()
    const root = await realpath(
      await mkdtemp(path.join(tmpdir(), 'platform-observability-runtime-')),
    )

    try {
      await writeFile(path.join(root, 'bun.lock'), '')
      const nestedCwd = path.join(root, 'apps/server')
      await mkdir(nestedCwd, { recursive: true })

      process.chdir(nestedCwd)
      const runtime = initializeObservabilityRuntime({
        env: {
          NODE_ENV: 'production',
          OBSERVABILITY_ENABLED: 'false',
        },
        source: 'test',
      })

      expect(runtime.config.logDir).toBe(path.join(root, 'logs'))
    } finally {
      process.chdir(cwd)
      await rm(root, { force: true, recursive: true })
    }
  })

  it('preserves absolute log dirs', () => {
    const logDir = path.join(process.cwd(), 'tmp/logs')
    const runtime = initializeObservabilityRuntime({
      env: {
        NODE_ENV: 'production',
        OBSERVABILITY_DIR: logDir,
        OBSERVABILITY_ENABLED: 'false',
      },
      source: 'test',
    })

    expect(runtime.config.logDir).toBe(logDir)
  })
})
