export type ObservabilityEnvironment = 'development' | 'production' | 'test'
export type ObservabilityEnv = Record<string, string | undefined>

export function observabilityEnabledFromEnv(env: ObservabilityEnv) {
  const environment = observabilityEnvironment(env)
  return booleanFromEnv(observabilityEnv(env, 'ENABLED')) ?? environment !== 'test'
}

export function observabilityEnvironment(env: ObservabilityEnv): ObservabilityEnvironment {
  if (env.NODE_ENV === 'production') return 'production'
  if (env.NODE_ENV === 'test') return 'test'

  return 'development'
}

export function booleanFromEnv(value: string | undefined) {
  if (value === undefined) return undefined

  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false

  return undefined
}

export function observabilityEnv(env: ObservabilityEnv, key: string) {
  return env[`OBSERVABILITY_${key}`]
}
