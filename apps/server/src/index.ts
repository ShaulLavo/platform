import { homedir } from 'node:os'
import path from 'node:path'
import { createApp } from './app'

const port = Number(Bun.env.PORT ?? 3001)
const hostname = Bun.env.FS_HOST ?? Bun.env.HOST ?? '127.0.0.1'
const homeDirectory = homedir()
const systemRoot = Bun.env.FS_SYSTEM_ROOT ?? path.parse(homeDirectory).root
const workspaceRoot = Bun.env.FS_WORKSPACE_ROOT ?? systemRoot
const watch = Bun.env.FS_WATCH !== 'false'
const allowedOrigins = allowedOriginsFromEnv(Bun.env.FS_ALLOWED_ORIGINS)
const sessionToken = Bun.env.FS_SESSION_TOKEN
const maxTextFileBytes = numberFromEnv(Bun.env.FS_DEV_MAX_TEXT_FILE_BYTES)
const treeConcurrency = numberFromEnv(Bun.env.FS_TREE_CONCURRENCY)

assertLoopbackHost(hostname)

export const app = createApp({
  auth: { allowedOrigins, sessionToken },
  homeDirectory,
  maxTextFileBytes,
  systemRoot,
  treeConcurrency,
  watch,
  workspaceRoot,
}).listen({ hostname, port }, (server) => {
  console.log(`FS RPC server listening at http://${server.hostname}:${server.port}`)
  console.log(`Default browsing root: ${homeDirectory}`)
  console.log(`Workspace root: ${workspaceRoot}`)
  console.log(`System root: ${systemRoot}`)
})

export type App = typeof app

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

  throw new Error('FS RPC server must bind to a loopback host')
}
