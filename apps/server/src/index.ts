import { homedir } from 'node:os'
import path from 'node:path'
import { createApp } from './app'
import {
  errorSummary,
  flushObservability,
  initializeObservability,
  recordProcessError,
  recordProcessInfo,
  recordProcessWarning,
  serverErrors,
} from './observability'
import { defaultSecretsFilePath, defaultSettingsFilePath } from './settings/paths'
import { settingsPolicyFromEnv } from './settings/policy'

const port = Number(Bun.env.PORT ?? 3001)
const hostname = Bun.env.FS_HOST ?? Bun.env.HOST ?? '127.0.0.1'
const homeDirectory = homedir()
const systemRoot = Bun.env.FS_SYSTEM_ROOT ?? path.parse(homeDirectory).root
const configuredWorkspaceRoot = Bun.env.FS_WORKSPACE_ROOT
const workspaceRoot = configuredWorkspaceRoot ?? systemRoot
const watch = Bun.env.FS_WATCH !== 'false'
const allowedOrigins = allowedOriginsFromEnv(Bun.env.SERVER_ALLOWED_ORIGINS)
const sessionToken = Bun.env.FS_SESSION_TOKEN
const maxTextFileBytes = numberFromEnv(Bun.env.FS_DEV_MAX_TEXT_FILE_BYTES)
const treeConcurrency = numberFromEnv(Bun.env.FS_TREE_CONCURRENCY)

assertLoopbackHost(hostname)
initializeObservability(Bun.env)
installCrashHandlers()

export const app = createApp({
  auth: { allowedOrigins, sessionToken },
  homeDirectory,
  maxTextFileBytes,
  orchestration: { providerRuntime: true },
  settings: {
    policy: settingsPolicyFromEnv(Bun.env),
    secretsFilePath: Bun.env.PLATFORM_SECRETS_FILE ?? defaultSecretsFilePath(),
    userFilePath: Bun.env.PLATFORM_SETTINGS_FILE ?? defaultSettingsFilePath(),
    watch: Bun.env.FS_WATCH !== 'false',
  },
  systemRoot,
  treeConcurrency,
  watch,
  workspaceRoot: configuredWorkspaceRoot,
}).listen({ hostname, port }, (server) => {
  recordProcessInfo('server.start', {
    homeDirectory,
    hostname: server.hostname,
    port: server.port,
    systemRoot,
    workspaceRoot,
  })
})
installShutdownHandlers()

export type App = typeof app

/**
 * Bun ends the process on an unhandled rejection, and until this existed the
 * only trace was on stderr — nothing in `logs/*.jsonl`, which is the file
 * AGENTS.md tells everyone to debug from. Registering a handler suppresses
 * Bun's own exit, so this deliberately re-creates it: record, flush, exit 1.
 */
function installCrashHandlers() {
  let crashing = false

  process.on('unhandledRejection', (reason) => {
    if (crashing) return

    crashing = true
    recordProcessError('server.unhandled_rejection', { error: errorSummary(reason) })
    void crash()
  })
}

async function crash() {
  await flushObservability()
  process.exit(1)
}

function installShutdownHandlers() {
  let stopping = false

  const stop = (signal: NodeJS.Signals) => {
    if (stopping) return

    stopping = true
    void stopServer(signal)
  }

  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
}

async function stopServer(signal: NodeJS.Signals) {
  recordProcessInfo('server.stop', { signal })

  try {
    await app.stop()
  } catch (error) {
    recordProcessWarning('server.stop_failed', {
      error: errorMessage(error),
      signal,
    })
    await flushObservability()
    process.exit(1)
  }

  process.exit(exitCodeForSignal(signal))
}

function allowedOriginsFromEnv(value: string | undefined) {
  if (!value) return undefined

  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
  return origins.length > 0 ? origins : undefined
}

function numberFromEnv(value: string | undefined) {
  if (!value) return undefined

  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function assertLoopbackHost(host: string) {
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return

  throw serverErrors.LOOPBACK_HOST_REQUIRED()
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message

  return String(error)
}

function exitCodeForSignal(signal: NodeJS.Signals) {
  if (signal === 'SIGINT') return 130
  if (signal === 'SIGTERM') return 143

  return 0
}
