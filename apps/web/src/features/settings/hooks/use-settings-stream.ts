import { errorNumberField, errorStringField, settingsEventSchema } from '@workspace/contracts'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import * as v from 'valibot'

import { getClient } from '@/lib/client'
import { log } from '@/lib/client-logging'
import { parseEdenSseStream, unwrapEdenResponse } from '@/lib/eden-events'

import {
  admitSettingsEvent,
  refreshConfirmedSettings,
} from '@/features/settings/state/snapshot-admission'

type SettingsStreamDependencies = {
  readonly connect: (signal: AbortSignal) => Promise<unknown>
  readonly wait: (delayMs: number, signal: AbortSignal) => Promise<boolean>
}

const defaultDependencies: SettingsStreamDependencies = {
  connect: connectSettingsStream,
  wait: waitForReconnect,
}

/** Keeps the infinite-stale confirmed document live across disconnects. */
export function useSettingsStream() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const controller = new AbortController()
    void superviseSettingsStream(queryClient, controller.signal)

    return () => controller.abort()
  }, [queryClient])
}

export async function superviseSettingsStream(
  queryClient: QueryClient,
  signal: AbortSignal,
  overrides: Partial<SettingsStreamDependencies> = {},
) {
  const dependencies = { ...defaultDependencies, ...overrides }
  let attempt = 0
  let consecutiveFailures = 0
  while (!signal.aborted) {
    attempt += 1
    const result = await runStreamAttempt(queryClient, signal, dependencies.connect)
    if (result.outcome === 'aborted') {
      log.debug({
        action: 'settings.stream',
        admittedEventCount: result.admittedEventCount,
        area: 'settings',
        attempt,
        durationMs: result.durationMs,
        invalidEventCount: result.invalidEventCount,
        outcome: result.outcome,
        receivedEventCount: result.receivedEventCount,
        refetchOutcome: result.refetchOutcome,
      })
      return
    }

    consecutiveFailures = result.receivedEventCount > 0 ? 0 : consecutiveFailures + 1
    const backoffMs = reconnectDelay(consecutiveFailures)
    log.warn({
      action: 'settings.stream',
      admittedEventCount: result.admittedEventCount,
      area: 'settings',
      attempt,
      backoffMs,
      durationMs: result.durationMs,
      errorCode: result.errorCode,
      errorStatus: result.errorStatus,
      invalidEventCount: result.invalidEventCount,
      outcome: result.outcome,
      receivedEventCount: result.receivedEventCount,
      refetchOutcome: result.refetchOutcome,
    })

    if (signal.aborted) return
    if (!(await dependencies.wait(backoffMs, signal))) return
  }
}

async function runStreamAttempt(
  queryClient: QueryClient,
  signal: AbortSignal,
  connect: SettingsStreamDependencies['connect'],
) {
  const attemptController = new AbortController()
  const abortAttempt = () => attemptController.abort()
  if (signal.aborted) abortAttempt()
  signal.addEventListener('abort', abortAttempt, { once: true })
  const startedAt = now()
  let admittedEventCount = 0
  let invalidEventCount = 0
  let receivedEventCount = 0
  let refetchOutcome: StreamRefetchOutcome = 'not-needed'

  try {
    const connection = settleConnection(connect(attemptController.signal))
    refetchOutcome = await recoverConfirmedDocument(queryClient, attemptController.signal)
    if (refetchOutcome !== 'ok') {
      abortAttempt()
      return streamAttemptResult(
        signal.aborted ? 'aborted' : 'error',
        startedAt,
        admittedEventCount,
        invalidEventCount,
        receivedEventCount,
        refetchOutcome,
      )
    }

    const connected = await connection
    if (connected.kind === 'error') throw connected.error

    const stream = connected.stream
    for await (const event of parseEdenSseStream(stream)) {
      receivedEventCount += 1
      const parsed = v.safeParse(settingsEventSchema, event.data)
      if (!parsed.success) {
        invalidEventCount += 1
        continue
      }

      const admission = await admitSettingsEvent(queryClient, parsed.output)
      if (admission.admitted) admittedEventCount += 1
    }

    return streamAttemptResult(
      signal.aborted ? 'aborted' : 'disconnected',
      startedAt,
      admittedEventCount,
      invalidEventCount,
      receivedEventCount,
      refetchOutcome,
    )
  } catch (error) {
    return streamAttemptResult(
      signal.aborted ? 'aborted' : 'error',
      startedAt,
      admittedEventCount,
      invalidEventCount,
      receivedEventCount,
      refetchOutcome,
      error,
    )
  } finally {
    signal.removeEventListener('abort', abortAttempt)
  }
}

function streamAttemptResult(
  outcome: 'aborted' | 'disconnected' | 'error',
  startedAt: number,
  admittedEventCount: number,
  invalidEventCount: number,
  receivedEventCount: number,
  refetchOutcome: StreamRefetchOutcome,
  error?: unknown,
) {
  return {
    admittedEventCount,
    durationMs: Math.round((now() - startedAt) * 100) / 100,
    errorCode: errorStringField(error, 'code'),
    errorStatus: errorNumberField(error, 'status') ?? errorNumberField(error, 'statusCode'),
    invalidEventCount,
    outcome,
    receivedEventCount,
    refetchOutcome,
  } as const
}

type StreamRefetchOutcome = 'aborted' | 'error' | 'not-needed' | 'ok'

function settleConnection(connection: Promise<unknown>) {
  return connection.then(
    (stream) => ({ kind: 'connected' as const, stream }),
    (error: unknown) => ({ error, kind: 'error' as const }),
  )
}

async function recoverConfirmedDocument(queryClient: QueryClient, signal: AbortSignal) {
  try {
    await refreshConfirmedSettings(queryClient, signal)
    return 'ok' as const
  } catch {
    return signal.aborted ? ('aborted' as const) : ('error' as const)
  }
}

async function connectSettingsStream(signal: AbortSignal) {
  const response = await getClient().settings.events.get({ fetch: { signal } })
  return unwrapEdenResponse(response, {
    emptyMessage: 'settings event stream returned an empty response',
    requireData: true,
  })
}

function reconnectDelay(failureCount: number) {
  return Math.min(250 * 2 ** Math.max(0, failureCount - 1), 5_000)
}

function waitForReconnect(delayMs: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false)

  return new Promise((resolve) => {
    const timeoutId = window.setTimeout(() => settle(true), delayMs)
    const onAbort = () => settle(false)
    const settle = (ready: boolean) => {
      window.clearTimeout(timeoutId)
      signal.removeEventListener('abort', onAbort)
      resolve(ready)
    }

    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function now() {
  return typeof performance === 'undefined' ? Date.now() : performance.now()
}
