import { afterEach, describe, expect, it } from 'vitest'

import {
  initializeObservabilityRuntime,
  isObservabilityActive,
  recordObservabilityInfo,
  resetObservabilityForTests,
} from './runtime'

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
})
