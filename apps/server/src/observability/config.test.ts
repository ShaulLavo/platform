import { describe, expect, it } from 'bun:test'

import { observabilityConfigFromEnv } from './config'

describe('observability config', () => {
  it('uses production defaults for balanced file logging', () => {
    const config = observabilityConfigFromEnv({ NODE_ENV: 'production' })

    expect(config).toMatchObject({
      consoleEnabled: false,
      debugSampleRate: 0,
      enabled: true,
      environment: 'production',
      filePretty: false,
      infoSampleRate: 25,
      logDir: '.evlog/logs',
      maxBufferSize: 1_000,
      maxFiles: 14,
      maxSizePerFile: 10_485_760,
      slowMs: 500,
    })
  })

  it('disables observability by default during tests', () => {
    const config = observabilityConfigFromEnv({ NODE_ENV: 'test' })

    expect(config.enabled).toBe(false)
    expect(config.consoleEnabled).toBe(true)
    expect(config.infoSampleRate).toBe(100)
  })

  it('honors public environment overrides', () => {
    const config = observabilityConfigFromEnv({
      FS_OBSERVABILITY_CONSOLE: 'true',
      FS_OBSERVABILITY_DIR: '/tmp/platform-logs',
      FS_OBSERVABILITY_ENABLED: 'true',
      FS_OBSERVABILITY_FILE_PRETTY: 'true',
      FS_OBSERVABILITY_INFO_SAMPLE_RATE: '5',
      FS_OBSERVABILITY_MAX_FILES: '3',
      FS_OBSERVABILITY_MAX_SIZE_BYTES: '1024',
      FS_OBSERVABILITY_SLOW_MS: '250',
      NODE_ENV: 'production',
    })

    expect(config).toMatchObject({
      consoleEnabled: true,
      enabled: true,
      filePretty: true,
      infoSampleRate: 5,
      logDir: '/tmp/platform-logs',
      maxFiles: 3,
      maxSizePerFile: 1024,
      slowMs: 250,
    })
  })
})
