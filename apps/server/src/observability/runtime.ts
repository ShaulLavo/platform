import { definePlugin, initLogger, log, type DrainContext } from 'evlog'
import { createFsDrain } from 'evlog/fs'
import { createDrainPipeline, type PipelineDrainFn } from 'evlog/pipeline'
import { createPostHogDrain } from 'evlog/posthog'

import {
  observabilityConfigFromEnv,
  type ObservabilityConfig,
  type ObservabilityEnv,
} from './config'

type ObservabilityDrain = PipelineDrainFn<DrainContext>

type ObservabilityRuntime = {
  config: ObservabilityConfig
  drain: ObservabilityDrain | null
}

type DrainAdapter = {
  drain: ObservabilityDrain
}

const disabledConfig = observabilityConfigFromEnv({
  OBSERVABILITY_ENABLED: 'false',
  NODE_ENV: 'test',
})

let runtime: ObservabilityRuntime = {
  config: disabledConfig,
  drain: null,
}

export function initializeObservability(env: ObservabilityEnv = process.env) {
  const config = observabilityConfigFromEnv(env)
  const drain = config.enabled ? createObservabilityDrain(config) : null

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
    plugins: [serverSourcePlugin],
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

function createObservabilityDrain(config: ObservabilityConfig) {
  const adapters = [createFileDrainAdapter(config), createPostHogDrainAdapter(config)].filter(
    isDrainAdapter,
  )

  return combineDrainAdapters(adapters)
}

function createFileDrainAdapter(config: ObservabilityConfig): DrainAdapter {
  const fsDrain = createFsDrain({
    dir: config.logDir,
    maxFiles: config.maxFiles,
    maxSizePerFile: config.maxSizePerFile,
    pretty: config.filePretty,
  })
  const pipeline = createAdapterPipeline('file', config)

  return {
    drain: pipeline(async (batch) => {
      if (!batch.length) return

      await fsDrain(batch)
    }),
  }
}

function createPostHogDrainAdapter(config: ObservabilityConfig): DrainAdapter | null {
  if (!config.postHogEnabled) return null
  if (!config.postHogApiKey) {
    writeDiagnostic(
      '[observability] PostHog drain enabled but no API key configured; skipping PostHog logs.',
    )
    return null
  }

  const postHogDrain = createPostHogDrain({
    apiKey: config.postHogApiKey,
    distinctId: config.postHogDistinctId,
    eventName: config.postHogEventName,
    host: config.postHogHost,
    mode: config.postHogMode,
    retries: config.postHogRetries,
    timeout: config.postHogTimeoutMs,
  })
  const pipeline = createAdapterPipeline('posthog', config)

  return {
    drain: pipeline(async (batch) => {
      if (!batch.length) return

      await postHogDrain(batch)
    }),
  }
}

function createAdapterPipeline(name: string, config: ObservabilityConfig) {
  return createDrainPipeline<DrainContext>({
    batch: {
      intervalMs: config.batchIntervalMs,
      size: config.batchSize,
    },
    maxBufferSize: config.maxBufferSize,
    onDropped: (events, error) => {
      writeDiagnostic(
        `[observability] ${name} dropped ${events.length} log event(s): ${errorMessage(error)}`,
      )
    },
    retry: {
      backoff: 'exponential',
      initialDelayMs: 1_000,
      maxAttempts: 3,
    },
  })
}

function combineDrainAdapters(adapters: readonly DrainAdapter[]) {
  const drain = ((context: DrainContext) => {
    if (!shouldPersistEvent(context)) return

    for (const adapter of adapters) {
      adapter.drain(context)
    }
  }) as ((context: DrainContext) => void) & { flush?: () => Promise<void> }

  drain.flush = async () => {
    await Promise.all(adapters.map(flushAdapter))
  }
  Object.defineProperty(drain, 'pending', {
    get: () => pendingEvents(adapters),
  })

  return drain as ObservabilityDrain
}

async function flushAdapter(adapter: DrainAdapter) {
  await adapter.drain.flush()
}

function pendingEvents(adapters: readonly DrainAdapter[]) {
  return adapters.reduce((total, adapter) => total + adapter.drain.pending, 0)
}

function isDrainAdapter(adapter: DrainAdapter | null): adapter is DrainAdapter {
  return adapter !== null
}

function shouldPersistEvent(context: DrainContext) {
  if (isRoutineHealthEvent(context)) return false
  if (isRoutineClientLogIngestEvent(context)) return false

  return true
}

function isRoutineHealthEvent(context: DrainContext) {
  const event = context.event as Record<string, unknown>
  if (event.path !== '/health') return false
  if (typeof event.status !== 'number') return false

  return event.status < 400
}

function isRoutineClientLogIngestEvent(context: DrainContext) {
  const event = context.event as Record<string, unknown>
  if (event.path !== '/_log/ingest') return false
  if (typeof event.status !== 'number') return false

  return event.status < 400
}

const serverSourcePlugin = definePlugin({
  name: 'platform.server-source',
  enrich({ event }) {
    if (typeof event.source === 'string') return

    event.source = 'be'
  },
})

function writeDiagnostic(message: string) {
  process.stderr.write(`${message}\n`)
}

function errorMessage(error: Error | undefined) {
  return error?.message ?? 'unknown drain failure'
}
