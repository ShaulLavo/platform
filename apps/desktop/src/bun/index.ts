import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import Electrobun, { BrowserView, BrowserWindow, Utils } from 'electrobun/bun'
import type { DesktopRPC, PlatformPickOptions } from '../shared/rpc'

type ChildProcess = ReturnType<typeof Bun.spawn>

const ROOT_DIR = path.resolve(import.meta.dirname, '../../../..')
const WEB_DIR = path.join(ROOT_DIR, 'apps/web')
const WEB_HOST = '127.0.0.1'
const WEB_PORT = 5173
const WEB_URL = `http://localhost:${WEB_PORT}`
const SERVER_HOST = '127.0.0.1'
const SERVER_PORT = 3001
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
  spawnServer()
  spawnWeb()
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
      VITE_SERVER_URL: `http://${SERVER_HOST}:${SERVER_PORT}`,
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
  return await Utils.openFileDialog({
    allowedFileTypes: allowedFileTypes(options.accept),
    allowsMultipleSelection: options.multiple === true,
    canChooseDirectory: options.mode === 'folder',
    canChooseFiles: options.mode === 'file',
    startingFolder: startingFolder(options.startingPath),
  })
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
    const response = await fetch(url)
    return response.ok
  } catch {
    return false
  }
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
  if (!input) return ''
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
