import { isRecord } from '@workspace/contracts'
import type { RequestLogger } from 'evlog'
import { useLogger } from 'evlog/elysia'

import { isObservabilityActive, recordProcessWarning } from './runtime'

export type OperationContext = {
  area: string
  operation: string
  path?: string
  [key: string]: unknown
}

type OperationSummary = OperationContext & {
  durationMs: number
  status: 'error' | 'ok'
}

const redactedDiagnosticValue = '[redacted]'
const sensitiveErrorFields = new Set([
  'absolutePath',
  'cwd',
  'dest',
  'destination',
  'fileName',
  'filename',
  'path',
])

export async function observeRequestOperation<T>(
  context: OperationContext,
  operation: () => Promise<T>,
  summarize?: (result: T) => Record<string, unknown>,
): Promise<T> {
  if (!isObservabilityActive()) return operation()

  const startedAt = performance.now()
  recordRequestContext(baseContext(context))

  try {
    const result = await operation()
    recordOperationSummary({
      ...context,
      ...summarizeResult(summarize, result),
      durationMs: elapsedMs(startedAt),
      status: 'ok',
    })
    return result
  } catch (error) {
    recordRequestError(error, {
      ...context,
      durationMs: elapsedMs(startedAt),
    })
    recordOperationSummary({
      ...context,
      durationMs: elapsedMs(startedAt),
      error: errorSummary(error),
      status: 'error',
    })
    throw error
  }
}

export function recordRequestContext(context: Record<string, unknown>) {
  const logger = currentRequestLogger()
  if (!logger) return

  logger.set(context)
}

export function recordRequestWarning(message: string, context: Record<string, unknown> = {}) {
  const logger = currentRequestLogger()
  if (!logger) {
    recordProcessWarning(message, context)
    return
  }

  logger.warn(message, safeDiagnosticContext(context))
}

export function recordRequestError(error: unknown, context: Record<string, unknown> = {}) {
  const logger = currentRequestLogger()
  if (!logger) return

  logger.error(errorForLogger(error), safeDiagnosticContext(context))
}

export function recordGitCommand(summary: {
  action: string
  allowFailure: boolean
  durationMs: number
  exitCode: number
  stderrTail?: string
}) {
  const logger = currentRequestLogger()
  if (!logger) return

  const previous = gitContext(logger)
  const failed = summary.exitCode !== 0
  logger.set({
    area: 'git',
    git: {
      allowedFailureCount: previous.allowedFailureCount + allowedFailure(summary),
      commandCount: previous.commandCount + 1,
      commandDurationMs: roundMs(previous.commandDurationMs + summary.durationMs),
      failedCommand: failed ? failedCommand(summary) : previous.failedCommand,
      failedCommandCount: previous.failedCommandCount + failedCommandCount(summary),
      slowestCommand: slowestCommand(previous.slowestCommand, summary),
    },
  })
}

export function recordStreamSummary(context: OperationSummary) {
  if (!isObservabilityActive()) return

  recordOperationSummary(context)
}

export function elapsedMs(startedAt: number) {
  return roundMs(performance.now() - startedAt)
}

export function errorSummary(error: unknown) {
  if (error instanceof Error) {
    return {
      code: errorCode(error),
      message: limitText(error.message, 500),
      name: error.name,
    }
  }

  return {
    message: limitText(String(error), 500),
    name: typeof error,
  }
}

export function limitText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value

  return value.slice(Math.max(0, value.length - maxLength))
}

function currentRequestLogger(): RequestLogger<Record<string, unknown>> | null {
  if (!isObservabilityActive()) return null

  try {
    return useLogger()
  } catch {
    return null
  }
}

function baseContext(context: OperationContext) {
  return {
    area: context.area,
    operation: context.operation,
  }
}

function recordOperationSummary(summary: OperationSummary) {
  recordRequestContext({
    area: summary.area,
    operation: summary.operation,
    [summary.area]: {
      operations: [summary],
    },
  })
}

function summarizeResult<T>(
  summarize: ((result: T) => Record<string, unknown>) | undefined,
  result: T,
) {
  return summarize?.(result) ?? {}
}

function errorForLogger(error: unknown) {
  if (error instanceof Error) return sanitizedErrorForLogger(error)

  return String(error)
}

function sanitizedErrorForLogger(error: Error) {
  const cause = errorCause(error)
  const clone = cause === undefined ? new Error(error.message) : new Error(error.message, {
    cause: sanitizeErrorCause(cause),
  })
  clone.name = error.name
  clone.stack = error.stack
  copySafeErrorFields(error, clone)

  return clone
}

function sanitizeErrorCause(cause: unknown, seen = new WeakSet<object>()): unknown {
  if (cause instanceof Error) return sanitizeErrorObject(cause, seen)
  if (Array.isArray(cause)) return cause.map((value) => sanitizeErrorCause(value, seen))
  if (!isRecord(cause)) return cause
  if (seen.has(cause)) return '[circular]'

  seen.add(cause)
  return sanitizeRecord(cause, seen)
}

function sanitizeErrorObject(error: Error, seen: WeakSet<object>) {
  if (seen.has(error)) return '[circular]'

  seen.add(error)
  const cause = errorCause(error)
  const summary: Record<string, unknown> = {
    message: sanitizeErrorMessage(error.message),
    name: error.name,
  }
  copySafeErrorFields(error, summary, seen)
  if (cause !== undefined) summary.cause = sanitizeErrorCause(cause, seen)

  return summary
}

function sanitizeRecord(record: Record<string, unknown>, seen: WeakSet<object>) {
  const safe: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(record)) {
    safe[key] = sensitiveErrorFields.has(key) ? redactedDiagnosticValue : sanitizeErrorCause(value, seen)
  }

  return safe
}

function copySafeErrorFields(
  source: Error,
  target: Record<string, unknown>,
  seen = new WeakSet<object>(),
) {
  for (const [key, value] of Object.entries(source)) {
    if (key === 'cause') continue
    target[key] = sensitiveErrorFields.has(key) ? redactedDiagnosticValue : sanitizeErrorCause(value, seen)
  }
}

function sanitizeErrorMessage(message: string) {
  return message.replaceAll(/'[^']*'/g, `'${redactedDiagnosticValue}'`)
}

function errorCause(error: Error) {
  return 'cause' in error ? error.cause : undefined
}

function safeDiagnosticContext(context: Record<string, unknown>) {
  if (!('path' in context)) return context

  const { path, ...rest } = context
  return {
    ...rest,
    targetPath: path,
  }
}

function errorCode(error: Error) {
  if (!('code' in error)) return undefined

  const code = error.code
  return typeof code === 'string' ? code : undefined
}

function gitContext(logger: RequestLogger<Record<string, unknown>>) {
  const context = logger.getContext()
  const git = isRecord(context.git) ? context.git : {}

  return {
    allowedFailureCount: numberField(git.allowedFailureCount),
    commandCount: numberField(git.commandCount),
    commandDurationMs: numberField(git.commandDurationMs),
    failedCommand: isRecord(git.failedCommand) ? git.failedCommand : undefined,
    failedCommandCount: numberField(git.failedCommandCount),
    slowestCommand: isRecord(git.slowestCommand) ? git.slowestCommand : undefined,
  }
}

function allowedFailure(summary: { allowFailure: boolean; exitCode: number }) {
  return summary.allowFailure && summary.exitCode !== 0 ? 1 : 0
}

function failedCommandCount(summary: { allowFailure: boolean; exitCode: number }) {
  return !summary.allowFailure && summary.exitCode !== 0 ? 1 : 0
}

function failedCommand(summary: {
  action: string
  durationMs: number
  exitCode: number
  stderrTail?: string
}) {
  return {
    action: summary.action,
    durationMs: summary.durationMs,
    exitCode: summary.exitCode,
    stderrTail: summary.stderrTail,
  }
}

function slowestCommand(
  previous: Record<string, unknown> | undefined,
  summary: { action: string; durationMs: number; exitCode: number },
) {
  const previousDuration = numberField(previous?.durationMs)
  if (previous && previousDuration >= summary.durationMs) return previous

  return {
    action: summary.action,
    durationMs: summary.durationMs,
    exitCode: summary.exitCode,
  }
}

function numberField(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function roundMs(value: number) {
  return Math.round(value * 100) / 100
}
