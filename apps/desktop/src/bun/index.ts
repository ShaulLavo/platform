import { existsSync, readdirSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import Electrobun, { BrowserView, BrowserWindow, Utils } from 'electrobun/bun'
import type { DesktopRPC, PlatformPickOptions } from '../shared/rpc'

type ChildProcess = ReturnType<typeof Bun.spawn>

const ROOT_DIR = resolvePlatformRoot()
const WEB_DIR = path.join(ROOT_DIR, 'apps/web')
const SHARED_DEV = Bun.env.PLATFORM_DESKTOP_SHARED_DEV === '1'
const WEB_HOST = '127.0.0.1'
const WEB_PORT = 5173
const WEB_URL = SHARED_DEV ? `http://localhost:${WEB_PORT}` : `http://${WEB_HOST}:${WEB_PORT}`
const SERVER_HOST = '127.0.0.1'
const SERVER_PORT = 3001
const SERVER_URL = `http://${SERVER_HOST}:${SERVER_PORT}`
const SERVER_PROBE_ORIGIN = `http://localhost:${WEB_PORT}`
const SERVER_ALLOWED_ORIGINS = allowedOrigins([
  `http://localhost:${WEB_PORT}`,
  `http://127.0.0.1:${WEB_PORT}`,
])
const childProcesses = new Set<ChildProcess>()

let stopping = false

Electrobun.events.on('before-quit', async () => {
  await stopProcesses()
})

try {
  await startDesktop()
} catch (error) {
  console.error(errorMessage(error))
  await stopProcesses()
  Utils.quit()
}

async function startDesktop() {
  if (SHARED_DEV) {
    await startSharedDesktop()
    return
  }

  await startStandaloneDesktop()
}

async function startSharedDesktop() {
  console.log('[desktop] shared dev mode: waiting for turbo-managed server and web')
  await waitForHttp(`${SERVER_URL}/health`)
  await waitForHttp(WEB_URL)
  openMainWindow()
}

async function startStandaloneDesktop() {
  await releasePlatformPort(SERVER_HOST, SERVER_PORT, 'server')
  await releasePlatformPort(WEB_HOST, WEB_PORT, 'web')
  spawnServer()
  spawnWeb()
  await waitForHttp(`${SERVER_URL}/health`)
  await waitForHttp(WEB_URL)
  openMainWindow()
}

function spawnServer() {
  return spawnProcess(
    'server',
    [process.execPath, '--env-file=.env', 'apps/server/src/index.ts'],
    ROOT_DIR,
    {
      ...Bun.env,
      FS_HOST: SERVER_HOST,
      PORT: String(SERVER_PORT),
      SERVER_ALLOWED_ORIGINS,
    },
  )
}

function spawnWeb() {
  return spawnProcess(
    'web',
    [
      process.execPath,
      '--env-file=../../.env',
      'vite',
      '--host',
      WEB_HOST,
      '--port',
      String(WEB_PORT),
      '--strictPort',
    ],
    WEB_DIR,
    withNode22Path({
      ...Bun.env,
      VITE_SERVER_URL: SERVER_URL,
    }),
  )
}

function openMainWindow() {
  const rpc = BrowserView.defineRPC<DesktopRPC>({
    maxRequestTime: 120_000,
    handlers: {
      requests: {
        pickEntry,
      },
    },
  })

  new BrowserWindow({
    title: 'Platform',
    frame: {
      x: 100,
      y: 100,
      width: 1440,
      height: 960,
    },
    preload: 'views://preload/index.js',
    rpc,
    titleBarStyle: 'default',
    url: WEB_URL,
  })
}

async function pickEntry(options: PlatformPickOptions) {
  const folder = startingFolder(options.startingPath)
  console.log(`[desktop] picker opening: mode=${options.mode} startingFolder=${folder}`)
  const paths = await openFileDialog(options, folder)

  const selectedPaths = paths.filter(Boolean)
  console.log(`[desktop] picker selected: count=${selectedPaths.length} first=${selectedPaths[0]}`)
  return { paths: selectedPaths }
}

async function openFileDialog(options: PlatformPickOptions, startingFolder: string) {
  try {
    return await Utils.openFileDialog({
      allowedFileTypes: allowedFileTypes(options.accept),
      allowsMultipleSelection: options.multiple === true,
      canChooseDirectory: options.mode === 'folder',
      canChooseFiles: options.mode === 'file',
      startingFolder,
    })
  } catch (error) {
    console.error(`[desktop] picker failed: ${errorMessage(error)}`)
    throw error
  }
}

function spawnProcess(
  name: string,
  command: string[],
  cwd: string,
  env: Record<string, string | undefined>,
) {
  console.log(`[desktop] ${name}: ${command.join(' ')}`)
  const child = Bun.spawn({
    cmd: command,
    cwd,
    env,
    stderr: 'inherit',
    stdout: 'inherit',
  })

  childProcesses.add(child)
  void monitorProcess(name, child)
  return child
}

async function monitorProcess(name: string, child: ChildProcess) {
  const exitCode = await child.exited
  childProcesses.delete(child)
  if (stopping) return

  console.error(`[desktop] ${name} exited with code ${exitCode}; quitting`)
  await stopProcesses()
  Utils.quit()
}

async function waitForHttp(url: string) {
  const deadline = Date.now() + 30_000

  while (Date.now() < deadline) {
    if (await isHttpReady(url)) return

    await Bun.sleep(250)
  }

  throw new Error(`Timed out waiting for ${url}`)
}

async function isHttpReady(url: string) {
  try {
    const response = await fetch(url, {
      headers: requestHeadersForProbe(url),
    })
    return response.ok
  } catch {
    return false
  }
}

function requestHeadersForProbe(url: string) {
  if (!url.startsWith(SERVER_URL)) return undefined

  return { Origin: SERVER_PROBE_ORIGIN }
}

async function releasePlatformPort(host: string, port: number, label: string) {
  if (!(await canConnect(host, port))) return

  const processes = await platformProcessesOnPort(port)
  if (processes.length === 0) {
    throw new Error(
      `The desktop ${label} port ${host}:${port} is already in use by a non-platform process.`,
    )
  }

  console.log(
    `[desktop] ${label} port ${host}:${port} is busy; stopping ${processes.length} platform process(es)`,
  )

  killProcesses(processes, 'SIGTERM')

  if (await waitForPortRelease(host, port, 2_500)) return

  const stubbornProcesses = await platformProcessesOnPort(port)
  killProcesses(stubbornProcesses, 'SIGKILL')

  if (await waitForPortRelease(host, port, 2_500)) return

  throw new Error(
    `The desktop ${label} port ${host}:${port} did not clear after stopping old platform processes.`,
  )
}

async function waitForPortRelease(host: string, port: number, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (!(await canConnect(host, port))) return true

    await Bun.sleep(100)
  }

  return false
}

function killProcesses(processes: Array<{ command: string; pid: number }>, signal: NodeJS.Signals) {
  for (const processInfo of processes) {
    console.log(`[desktop] ${signal} pid ${processInfo.pid}: ${processInfo.command}`)
    process.kill(processInfo.pid, signal)
  }
}

async function platformProcessesOnPort(port: number) {
  const pids = await listenerPids(port)
  const processes = await Promise.all(pids.map(processInfo))
  return processes.filter(isPlatformProcess)
}

async function listenerPids(port: number) {
  const output = await commandOutput(['lsof', '-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fp'])
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('p'))
    .map((line) => Number(line.slice(1)))
    .filter((pid) => Number.isInteger(pid) && pid > 0)
}

async function processInfo(pid: number) {
  const [command, cwd] = await Promise.all([processCommand(pid), processCwd(pid)])
  return { command, cwd, pid }
}

async function processCommand(pid: number) {
  const output = await commandOutput(['ps', '-p', String(pid), '-o', 'command='])
  return output.trim()
}

async function processCwd(pid: number) {
  const output = await commandOutput(['lsof', '-a', '-p', String(pid), '-d', 'cwd', '-Fn'])
  const cwd = output
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('n'))

  return cwd ? cwd.slice(1) : ''
}

function isPlatformProcess(processInfo: { command: string; cwd: string }) {
  return isInsidePlatformRoot(processInfo.cwd) || processInfo.command.includes(ROOT_DIR)
}

function isInsidePlatformRoot(input: string) {
  if (!input) return false

  const relative = path.relative(ROOT_DIR, input)
  if (relative === '') return true
  if (relative.startsWith('..')) return false

  return !path.isAbsolute(relative)
}

async function commandOutput(command: string[]) {
  const child = Bun.spawn({
    cmd: command,
    stderr: 'pipe',
    stdout: 'pipe',
  })
  const output = await new Response(child.stdout).text()
  await child.exited

  return output
}

function canConnect(host: string, port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ host, port })
    const done = (available: boolean) => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(available)
    }

    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
    socket.setTimeout(500, () => done(false))
  })
}

async function stopProcesses() {
  if (stopping) return

  stopping = true
  const children = [...childProcesses]
  childProcesses.clear()

  for (const child of children) {
    child.kill()
  }

  await Promise.allSettled(children.map((child) => child.exited))
}

function allowedOrigins(origins: readonly string[]) {
  return unique([...origins, ...originsFromEnv(Bun.env.SERVER_ALLOWED_ORIGINS)]).join(',')
}

function originsFromEnv(value: string | undefined) {
  if (!value) return []

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

function unique(values: readonly string[]) {
  return Array.from(new Set(values))
}

function allowedFileTypes(accept: readonly string[] | undefined) {
  if (!accept || accept.length === 0) return '*'

  const extensions = accept.map(allowedFileType).filter(Boolean)
  return extensions.length > 0 ? extensions.join(',') : '*'
}

function allowedFileType(token: string) {
  return token.trim().replace(/^\*\./, '').replace(/^\./, '')
}

function startingFolder(input: string | undefined) {
  if (!input) return Bun.env.HOME ?? '~/'
  if (path.isAbsolute(input)) return input

  return path.join(path.parse(ROOT_DIR).root, input)
}

function withNode22Path(env: Record<string, string | undefined>) {
  const nodeBin = latestNode22Bin()
  if (!nodeBin) return env

  return {
    ...env,
    PATH: pathWithPrefix(nodeBin, env.PATH),
  }
}

function latestNode22Bin() {
  const home = Bun.env.HOME
  if (!home) return null

  const versionsDir = path.join(home, '.nvm/versions/node')
  if (!existsSync(versionsDir)) return null

  const bins = readdirSync(versionsDir)
    .filter((entry) => entry.startsWith('v22.'))
    .map((entry) => path.join(versionsDir, entry, 'bin'))
    .filter((entry) => existsSync(entry))

  return bins.toSorted().at(-1) ?? null
}

function pathWithPrefix(prefix: string, current: string | undefined) {
  const entries = current?.split(path.delimiter).filter(Boolean) ?? []
  if (entries.includes(prefix)) return current

  return [prefix, ...entries].join(path.delimiter)
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message

  return String(error)
}

function resolvePlatformRoot() {
  const candidates = [
    Bun.env.PLATFORM_ROOT,
    Bun.env.INIT_CWD,
    Bun.env.PWD,
    import.meta.dirname,
    process.cwd(),
  ].filter(isString)

  for (const candidate of candidates) {
    const root = findPlatformRoot(candidate)
    if (root) return root
  }

  throw new Error('Could not locate platform repository root.')
}

function findPlatformRoot(start: string) {
  let current = path.resolve(start)

  while (true) {
    if (isPlatformRoot(current)) return current

    const parent = path.dirname(current)
    if (parent === current) return null

    current = parent
  }
}

function isPlatformRoot(candidate: string) {
  return (
    existsSync(path.join(candidate, 'package.json')) &&
    existsSync(path.join(candidate, 'apps/server/src/index.ts')) &&
    existsSync(path.join(candidate, 'apps/web/package.json'))
  )
}

function isString(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0
}
