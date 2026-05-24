export type ObservabilityEnvironment = 'development' | 'production' | 'test'

export type ObservabilityConfig = {
  batchIntervalMs: number
  batchSize: number
  consoleEnabled: boolean
  debugSampleRate: number
  enabled: boolean
  environment: ObservabilityEnvironment
  filePretty: boolean
  infoSampleRate: number
  logDir: string
  maxBufferSize: number
  maxFiles: number
  maxSizePerFile: number
  service: string
  slowMs: number
}

export type ObservabilityEnv = Record<string, string | undefined>

const DEFAULT_BATCH_INTERVAL_MS = 5_000
const DEFAULT_BATCH_SIZE = 50
const DEFAULT_LOG_DIR = '.evlog/logs'
const DEFAULT_MAX_BUFFER_SIZE = 1_000
const DEFAULT_MAX_FILES = 14
const DEFAULT_MAX_SIZE_PER_FILE = 10_485_760
const DEFAULT_SLOW_MS = 500

export function observabilityConfigFromEnv(
  env: ObservabilityEnv = process.env,
): ObservabilityConfig {
  const environment = observabilityEnvironment(env)
  const enabled = booleanFromEnv(env.FS_OBSERVABILITY_ENABLED) ?? environment !== 'test'
  const production = environment === 'production'

  return {
    batchIntervalMs: positiveInteger(
      env.FS_OBSERVABILITY_BATCH_INTERVAL_MS,
      DEFAULT_BATCH_INTERVAL_MS,
    ),
    batchSize: positiveInteger(env.FS_OBSERVABILITY_BATCH_SIZE, DEFAULT_BATCH_SIZE),
    consoleEnabled: booleanFromEnv(env.FS_OBSERVABILITY_CONSOLE) ?? !production,
    debugSampleRate: production ? 0 : 100,
    enabled,
    environment,
    filePretty: booleanFromEnv(env.FS_OBSERVABILITY_FILE_PRETTY) ?? false,
    infoSampleRate: percentage(env.FS_OBSERVABILITY_INFO_SAMPLE_RATE, production ? 25 : 100),
    logDir: env.FS_OBSERVABILITY_DIR?.trim() || DEFAULT_LOG_DIR,
    maxBufferSize: positiveInteger(env.FS_OBSERVABILITY_MAX_BUFFER_SIZE, DEFAULT_MAX_BUFFER_SIZE),
    maxFiles: positiveInteger(env.FS_OBSERVABILITY_MAX_FILES, DEFAULT_MAX_FILES),
    maxSizePerFile: positiveInteger(env.FS_OBSERVABILITY_MAX_SIZE_BYTES, DEFAULT_MAX_SIZE_PER_FILE),
    service: env.FS_OBSERVABILITY_SERVICE?.trim() || 'platform',
    slowMs: positiveInteger(env.FS_OBSERVABILITY_SLOW_MS, DEFAULT_SLOW_MS),
  }
}

function observabilityEnvironment(env: ObservabilityEnv): ObservabilityEnvironment {
  if (env.NODE_ENV === 'production') return 'production'
  if (env.NODE_ENV === 'test') return 'test'

  return 'development'
}

function booleanFromEnv(value: string | undefined) {
  if (value === undefined) return undefined

  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false

  return undefined
}

function positiveInteger(value: string | undefined, fallback: number) {
  if (value === undefined) return fallback

  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback

  return parsed
}

function percentage(value: string | undefined, fallback: number) {
  if (value === undefined) return fallback

  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback

  return Math.max(0, Math.min(100, parsed))
}
