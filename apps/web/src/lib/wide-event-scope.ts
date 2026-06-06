import { createRequestLogger, type RequestLogger } from 'evlog'

import { clientLoggingEnabled, sanitizeRecord } from '@/lib/client-logging'

export type WideEventBase = {
  readonly action: string
  readonly area: string
  readonly [key: string]: unknown
}

/**
 * A client-side wide event: a single log line that accumulates state across a
 * multi-step unit of work (an editor instance, a subscription, a stream) and is
 * emitted exactly once when the work ends. This is the browser analog of the
 * server's request-scoped `useLogger().set()` — prefer it over firing a separate
 * `log.*` event per step.
 */
export type WideEventScope = {
  /** Merge context into the wide event (objects deep-merge, arrays concatenate). */
  set: (context: Record<string, unknown>) => void
  /** Increment a numeric counter at a dotted path, e.g. `plugin.activatedCount`. */
  increment: (path: string, by?: number) => void
  /** Read a numeric counter at a dotted path. */
  count: (path: string) => number
  /** Fold a warning into the wide event without emitting a separate log. */
  warn: (message: string, context?: Record<string, unknown>) => void
  /** Fold an error into the wide event without emitting a separate log. */
  error: (error: unknown, context?: Record<string, unknown>) => void
  /** Read the current accumulated context. */
  getContext: () => Record<string, unknown>
  /** Emit the accumulated wide event once. Further calls are no-ops. */
  end: (overrides?: Record<string, unknown>) => void
}

const noopScope: WideEventScope = {
  set: () => {},
  increment: () => {},
  count: () => 0,
  warn: () => {},
  error: () => {},
  getContext: () => ({}),
  end: () => {},
}

export function createWideEventScope(base: WideEventBase): WideEventScope {
  if (!clientLoggingEnabled()) return noopScope

  let logger: RequestLogger | null
  try {
    logger = createRequestLogger()
    logger.set(safeContext({ ...base, runtime: 'browser' }))
  } catch {
    return noopScope
  }

  let ended = false

  return {
    set(context) {
      if (ended || !logger) return

      guard(() => logger?.set(safeContext(context)))
    },
    increment(path, by = 1) {
      if (ended || !logger) return

      guard(() => {
        const current = numberAtPath(
          logger?.getContext() as Record<string, unknown> | undefined,
          path,
        )
        logger?.set(nestedValue(path, current + by))
      })
    },
    count(path) {
      if (!logger) return 0

      return numberAtPath(logger.getContext() as Record<string, unknown> | undefined, path)
    },
    warn(message, context) {
      if (ended || !logger) return

      guard(() => logger?.warn(message, context ? safeContext(context) : undefined))
    },
    error(error, context) {
      if (ended || !logger) return

      guard(() => logger?.error(toError(error), context ? safeContext(context) : undefined))
    },
    getContext() {
      if (!logger) return {}

      return logger.getContext() as Record<string, unknown>
    },
    end(overrides) {
      if (ended || !logger) return

      ended = true
      guard(() => logger?.emit(overrides ? safeContext(overrides) : undefined))
    },
  }
}

function safeContext(context: Record<string, unknown>) {
  return sanitizeRecord(context)
}

function guard(run: () => void) {
  try {
    run()
  } catch {
    // Logging must never affect user-facing app flows.
  }
}

function toError(error: unknown): Error | string {
  if (error instanceof Error) return error

  return String(error)
}

function nestedValue(path: string, value: unknown): Record<string, unknown> {
  const keys = path.split('.')
  return keys.reduceRight<unknown>((acc, key) => ({ [key]: acc }), value) as Record<string, unknown>
}

function numberAtPath(context: Record<string, unknown> | undefined, path: string): number {
  let current: unknown = context
  for (const key of path.split('.')) {
    if (!isRecord(current)) return 0
    current = current[key]
  }

  return typeof current === 'number' && Number.isFinite(current) ? current : 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
