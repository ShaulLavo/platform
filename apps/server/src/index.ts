import { homedir } from 'node:os'
import path from 'node:path'
import { createApp } from './app'
import {
  flushObservability,
  initializeObservability,
  recordProcessInfo,
  recordProcessWarning,
  serverErrors,
} from './observability'

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

export const app = createApp({
  auth: { allowedOrigins, sessionToken },
  homeDirectory,
  maxTextFileBytes,
  orchestration: { providerRuntime: true },
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
