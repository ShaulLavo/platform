import { initLogger, log, type DrainContext } from 'evlog'
import { createFsDrain } from 'evlog/fs'
import { createDrainPipeline, type PipelineDrainFn } from 'evlog/pipeline'

import {
  observabilityConfigFromEnv,
  type ObservabilityConfig,
  type ObservabilityEnv,
} from './config'

type ObservabilityRuntime = {
  config: ObservabilityConfig
  drain: PipelineDrainFn<DrainContext> | null
}

const disabledConfig = observabilityConfigFromEnv({
  FS_OBSERVABILITY_ENABLED: 'false',
  NODE_ENV: 'test',
})

let runtime: ObservabilityRuntime = {
  config: disabledConfig,
  drain: null,
}

export function initializeObservability(env: ObservabilityEnv = process.env) {
  const config = observabilityConfigFromEnv(env)
  const drain = config.enabled ? createFileDrain(config) : null

  initLogger({
    enabled: config.enabled,
    env: {
      environment: config.environment,
      service: config.service,
    },
    ...(drain ? { drain } : {}),
    pretty: config.consoleEnabled && config.environment !== 'production',
    redact: true,
    sampling: {
      keep: [{ status: 400 }, { duration: config.slowMs }],
      rates: {
        debug: config.debugSampleRate,
        error: 100,
        info: config.infoSampleRate,
        warn: 100,
      },
    },
    silent: !config.consoleEnabled,
    stringify: true,
  })

  runtime = { config, drain }
  return runtime
}

export function isObservabilityActive() {
  return runtime.config.enabled
}

export function observabilityConfig() {
  return runtime.config
}

export async function flushObservability() {
  await runtime.drain?.flush()
}

export async function resetObservabilityForTests() {
  await flushObservability()
  initLogger({
    enabled: false,
    env: {
      environment: 'test',
      service: 'platform',
    },
    silent: false,
  })
  runtime = { config: disabledConfig, drain: null }
}

export function recordProcessInfo(action: string, context: Record<string, unknown> = {}) {
  if (!runtime.config.enabled) return

  log.info({ action, ...context })
}

export function recordProcessWarning(action: string, context: Record<string, unknown> = {}) {
  if (!runtime.config.enabled) return

  log.warn({ action, ...context })
}

export function recordProcessError(action: string, context: Record<string, unknown> = {}) {
  if (!runtime.config.enabled) return

  log.error({ action, ...context })
}

function createFileDrain(config: ObservabilityConfig) {
  const fsDrain = createFsDrain({
    dir: config.logDir,
    maxFiles: config.maxFiles,
    maxSizePerFile: config.maxSizePerFile,
    pretty: config.filePretty,
  })
  const pipeline = createDrainPipeline<DrainContext>({
    batch: {
      intervalMs: config.batchIntervalMs,
      size: config.batchSize,
    },
    maxBufferSize: config.maxBufferSize,
    onDropped: (events, error) => {
      writeDiagnostic(
        `[observability] dropped ${events.length} log event(s): ${errorMessage(error)}`,
      )
    },
    retry: {
      backoff: 'exponential',
      initialDelayMs: 1_000,
      maxAttempts: 3,
    },
  })

  return pipeline(async (batch) => {
    const events = batch.filter(shouldPersistEvent)
    if (!events.length) return

    await fsDrain(events)
  })
}

function shouldPersistEvent(context: DrainContext) {
  if (isRoutineHealthEvent(context)) return false

  return true
}

function isRoutineHealthEvent(context: DrainContext) {
  const event = context.event as Record<string, unknown>
  if (event.path !== '/health') return false
  if (typeof event.status !== 'number') return false

  return event.status < 400
}

function writeDiagnostic(message: string) {
  process.stderr.write(`${message}\n`)
}

function errorMessage(error: Error | undefined) {
  return error?.message ?? 'unknown drain failure'
}
