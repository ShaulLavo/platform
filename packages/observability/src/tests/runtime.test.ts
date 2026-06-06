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

  it('resolves relative log dirs from the monorepo root', () => {
    const cwd = process.cwd()
    const nestedCwd = path.join(cwd, 'apps/server')

    try {
      process.chdir(nestedCwd)
      const runtime = initializeObservabilityRuntime({
        env: {
          NODE_ENV: 'production',
          OBSERVABILITY_ENABLED: 'false',
        },
        source: 'test',
      })

      expect(runtime.config.logDir).toBe(path.join(cwd, 'logs'))
    } finally {
      process.chdir(cwd)
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
