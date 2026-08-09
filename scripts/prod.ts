import { existsSync } from 'node:fs'
import path from 'node:path'
import { allowedOriginsForWebPort, portFromEnv, runtimeUrl } from './runtime-network'
import { createScriptError } from './structured-errors'

type Mode = 'all' | 'build' | 'start'
type ChildProcess = ReturnType<typeof Bun.spawn>

type ProdConfig = {
  allowedOrigins: string
  buildEnv: Record<string, string | undefined>
  serverEnv: Record<string, string | undefined>
  serverHost: string
  serverPort: number
  serverUrl: string
  webEnv: Record<string, string | undefined>
  webHost: string
  webPort: number
  webUrl: string
}

const root = path.resolve(import.meta.dirname, '..')

try {
  await main()
} catch (error) {
  console.error(errorMessage(error))
  process.exit(1)
}

async function main() {
  const mode = parseMode(Bun.argv[2])
  const config = readProdConfig()

  if (mode === 'build') {
    await buildProd(config)
    return
  }

  if (mode === 'start') {
    await startProd(config)
    return
  }

  await buildProd(config)
  await startProd(config)
}

async function buildProd(config: ProdConfig) {
  printBuildSummary(config)
  const code = await runCommand('build', ['bun', 'run', 'turbo', 'build'], root, config.buildEnv)
  if (code === 0) return

  process.exit(code)
}

async function startProd(config: ProdConfig) {
  ensureBuildArtifact('server', 'apps/server/dist/index.js')
  ensureBuildArtifact('client', 'apps/web/dist/index.html')
  printStartSummary(config)

  const children = [
    spawnProcess('server', ['bun', 'apps/server/dist/index.js'], root, config.serverEnv),
    spawnProcess(
      'client',
      [
        'bun',
        'run',
        '--cwd',
        path.join(root, 'apps/web'),
        'preview',
        '--host',
        config.webHost,
        '--port',
        String(config.webPort),
        '--strictPort',
      ],
      root,
      config.webEnv,
    ),
  ]

  installSignalHandlers(children)
  const exitCode = await Promise.race(children.map(waitForExit))
  await stopProcesses(children)
  process.exit(exitCode)
}

function readProdConfig(): ProdConfig {
  const serverHost = Bun.env.FS_HOST ?? Bun.env.HOST ?? '127.0.0.1'
  const webHost = Bun.env.WEB_HOST ?? '127.0.0.1'
  const serverPort = portFromEnv(Bun.env, 'PORT', 3001)
  const webPort = portFromEnv(Bun.env, 'WEB_PORT', 3000)
  const serverUrl = Bun.env.VITE_SERVER_URL ?? runtimeUrl(serverHost, serverPort)
  const webUrl = runtimeUrl(webHost, webPort)
  const allowedOrigins = allowedOriginsForWebPort(Bun.env.SERVER_ALLOWED_ORIGINS, webHost, webPort)

  const buildEnv = {
    ...Bun.env,
    BUN_ENV: 'production',
    NODE_ENV: 'production',
    VITE_SERVER_URL: serverUrl,
  }

  return {
    allowedOrigins,
    buildEnv,
    serverEnv: {
      ...buildEnv,
      PORT: String(serverPort),
      SERVER_ALLOWED_ORIGINS: allowedOrigins,
    },
    serverHost,
    serverPort,
    serverUrl,
    webEnv: buildEnv,
    webHost,
    webPort,
    webUrl,
  }
}

function parseMode(value: string | undefined): Mode {
  if (!value) return 'all'
  if (value === 'all' || value === 'build' || value === 'start') return value

  throw createScriptError(`Unknown production mode "${value}". Use build, start, or all.`)
}

function ensureBuildArtifact(label: string, relativePath: string) {
  const artifactPath = path.join(root, relativePath)
  if (existsSync(artifactPath)) return

  throw createScriptError(
    `Missing ${label} production artifact at ${relativePath}. ` +
      'Run `bun run build` first, or use `bun run prod`.',
  )
}

function printBuildSummary(config: ProdConfig) {
  console.log('[prod] Building production artifacts')
  console.log(`[prod] Client API URL: ${config.serverUrl}`)
}

function printStartSummary(config: ProdConfig) {
  console.log('[prod] Starting production app')
  console.log(`[prod] Client: ${config.webUrl}`)
  console.log(`[prod] Server: ${runtimeUrl(config.serverHost, config.serverPort)}`)
  console.log(`[prod] Server allowed origins: ${config.allowedOrigins}`)
}

function spawnProcess(
  name: string,
  command: string[],
  cwd: string,
  env: Record<string, string | undefined>,
) {
  console.log(`[prod] ${name}: ${command.join(' ')}`)
  return Bun.spawn({
    cmd: command,
    cwd,
    env,
    stderr: 'inherit',
    stdout: 'inherit',
  })
}

async function runCommand(
  name: string,
  command: string[],
  cwd: string,
  env: Record<string, string | undefined>,
) {
  const child = spawnProcess(name, command, cwd, env)
  return await child.exited
}

async function waitForExit(child: ChildProcess) {
  return await child.exited
}

function installSignalHandlers(children: ChildProcess[]) {
  let stopping = false
  const stop = () => {
    if (stopping) return

    stopping = true
    void stopProcesses(children)
  }

  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}

async function stopProcesses(children: ChildProcess[]) {
  for (const child of children) {
    child.kill()
  }

  await Promise.allSettled(children.map(waitForExit))
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message

  return String(error)
}
