import { initLog, log } from 'evlog/client'

import { serverUrl } from './client'

export type ClientLogLevel = 'debug' | 'error' | 'info' | 'warn'

export type ClientLogEvent = {
  readonly action: string
  readonly area: string
  readonly level?: ClientLogLevel
  readonly [key: string]: unknown
}

const serviceName = 'platform-web'
const ingestPath = '/_log/ingest'
const maxStringLength = 2_000
const redactedDiagnosticValue = '[redacted]'
const sensitiveFields = new Set([
  'absolutePath',
  'authorization',
  'body',
  'content',
  'cookie',
  'cwd',
  'dest',
  'destination',
  'fileName',
  'filename',
  'password',
  'patch',
  'secret',
  'set-cookie',
  'stack',
  'text',
  'token',
  'x-api-key',
])

let initialized = false

export function initializeClientLogging() {
  if (initialized) return

  initialized = true
  initLog({
    console: import.meta.env.DEV,
    enabled: clientLoggingEnabled(),
    minLevel: clientLogMinLevel(),
    pretty: import.meta.env.DEV,
    service: serviceName,
    transport: {
      enabled: true,
      endpoint: logIngestEndpoint(),
    },
  })
}

export function logClientEvent({ level = 'info', ...event }: ClientLogEvent): void {
  if (!clientLoggingEnabled()) return

  try {
    log[level](safeClientEvent(event))
  } catch {
    // Logging must never affect user-facing app flows.
  }
}

export async function observeClientOperation<T>(
  event: ClientLogEvent,
  operation: () => Promise<T>,
  summarize?: (result: T) => Record<string, unknown>,
): Promise<T> {
  const startedAt = performance.now()

  try {
    const result = await operation()
    logClientEvent({
      ...event,
      durationMs: elapsedMs(startedAt),
      outcome: 'ok',
      ...summarizeResult(summarize, result),
    })
    return result
  } catch (error) {
    if (!isAbortError(error)) {
      logClientEvent({
        ...event,
        durationMs: elapsedMs(startedAt),
        error: errorSummary(error),
        level: failedOperationLevel(event.level),
        outcome: 'error',
      })
    }

    throw error
  }
}

function logIngestEndpoint() {
  return `${serverUrl.replace(/\/$/u, '')}${ingestPath}`
}

function clientLoggingEnabled() {
  return import.meta.env.VITE_CLIENT_LOGGING !== 'false'
}

function clientLogMinLevel(): ClientLogLevel {
  const level = import.meta.env.VITE_CLIENT_LOG_LEVEL
  if (level === 'debug' || level === 'error' || level === 'info' || level === 'warn') return level

  return import.meta.env.DEV ? 'debug' : 'info'
}

function safeClientEvent(event: Record<string, unknown>) {
  return {
    ...sanitizeRecord(event),
    runtime: 'browser',
  }
}

function sanitizeDiagnosticValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value instanceof Error) return sanitizeError(value, seen)
  if (Array.isArray(value)) return value.map((item) => sanitizeDiagnosticValue(item, seen))
  if (!isRecord(value)) return sanitizePrimitive(value)
  if (seen.has(value)) return '[circular]'

  seen.add(value)
  return sanitizeRecord(value, seen)
}

function sanitizeError(error: Error, seen: WeakSet<object>) {
  if (seen.has(error)) return '[circular]'

  seen.add(error)
  return {
    cause: sanitizeDiagnosticValue(error.cause, seen),
    message: limitString(error.message),
    name: error.name,
  }
}

function sanitizeRecord(record: Record<string, unknown>, seen = new WeakSet<object>()) {
  const safe: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(record)) {
    safe[key] = sensitiveFields.has(key)
      ? redactedDiagnosticValue
      : sanitizeDiagnosticValue(value, seen)
  }

  return safe
}

function sanitizePrimitive(value: unknown) {
  return typeof value === 'string' ? limitString(value) : value
}

function summarizeResult<T>(
  summarize: ((result: T) => Record<string, unknown>) | undefined,
  result: T,
) {
  return summarize?.(result) ?? {}
}

function errorSummary(error: unknown) {
  if (error instanceof Error) {
    return {
      message: limitString(error.message),
      name: error.name,
    }
  }

  return {
    message: limitString(String(error)),
    name: typeof error,
  }
}

function failedOperationLevel(level: ClientLogLevel | undefined): ClientLogLevel {
  if (level === 'debug' || level === 'error') return level

  return 'warn'
}

function isAbortError(error: unknown) {
  if (error instanceof DOMException) return error.name === 'AbortError'
  if (error instanceof Error) return error.name === 'AbortError'

  return false
}

function elapsedMs(startedAt: number) {
  return Math.round((performance.now() - startedAt) * 100) / 100
}

function limitString(value: string) {
  if (value.length <= maxStringLength) return value

  return value.slice(0, maxStringLength)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
