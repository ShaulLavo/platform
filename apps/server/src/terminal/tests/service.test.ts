import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  TERMINAL_MAX_COLS,
  TERMINAL_MIN_ROWS,
  type TerminalServerMessage,
} from '@workspace/contracts'

import { createAuthConfig } from '../../auth'
import { createWorkspacePaths } from '../../fs/path'
import { TerminalService, type TerminalPtyExitEvent, type TerminalPtyFactory } from '../service'

const TRUSTED_ORIGIN = 'http://localhost:5173'
const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('terminal service', () => {
  it('spawns the user shell in the resolved workspace cwd', async () => {
    const root = await fixtureRoot()
    await mkdir(path.join(root, 'project'))
    const pty = createFakePtyFactory()
    const service = testService(root, {
      env: { SHELL: '/bin/zsh' },
      ptyFactory: pty.factory,
    })
    const ws = fakeSocket('project')

    service.routes(auth()).open(ws)

    expect(pty.spawns).toEqual([
      expect.objectContaining({
        cwd: path.join(root, 'project'),
        shell: '/bin/zsh',
      }),
    ])
    expect(ws.messages[0]).toEqual({
      cwd: path.join(root, 'project'),
      shell: '/bin/zsh',
      type: 'ready',
    })
  })

  it('falls back from bash to sh when no user shell is available', async () => {
    const root = await fixtureRoot()
    const pty = createFakePtyFactory({
      failShells: new Set(['bash']),
    })
    const service = testService(root, {
      env: {},
      ptyFactory: pty.factory,
    })
    const ws = fakeSocket('')

    service.routes(auth()).open(ws)

    expect(pty.spawns.map((spawn) => spawn.shell)).toEqual(['bash', 'sh'])
    expect(ws.messages[0]).toMatchObject({ shell: 'sh', type: 'ready' })
  })

  it('ignores malformed messages and normalizes resize bounds', async () => {
    const root = await fixtureRoot()
    const pty = createFakePtyFactory()
    const service = testService(root, { ptyFactory: pty.factory })
    const routes = service.routes(auth())
    const ws = fakeSocket('')

    routes.open(ws)
    routes.message(ws, { type: 'input', data: 'pwd\r' })
    routes.message(ws, { type: 'input', data: 1 })
    routes.message(ws, '{')
    routes.message(ws, {
      cols: TERMINAL_MAX_COLS + 100,
      rows: TERMINAL_MIN_ROWS - 100,
      type: 'resize',
    })

    expect(pty.ptys[0]?.writes).toEqual(['pwd\r'])
    expect(pty.ptys[0]?.resizes).toEqual([[TERMINAL_MAX_COLS, TERMINAL_MIN_ROWS]])
  })

  it('keeps the PTY alive on socket close and kills it on disposal', async () => {
    const root = await fixtureRoot()
    const pty = createFakePtyFactory()
    const service = testService(root, { ptyFactory: pty.factory })
    const routes = service.routes(auth())
    const ws = fakeSocket('')

    routes.open(ws)
    routes.close(ws)

    expect(pty.ptys).toHaveLength(1)
    expect(pty.ptys[0]?.killed).toBe(false)

    service.dispose()

    expect(pty.ptys[0]?.killed).toBe(true)
  })

  it('reuses the PTY and replays buffered output on reconnect', async () => {
    const root = await fixtureRoot()
    const pty = createFakePtyFactory()
    const service = testService(root, { ptyFactory: pty.factory })
    const routes = service.routes(auth())
    const first = fakeSocket('project')

    routes.open(first)
    pty.ptys[0]?.emit('streamed-output\r\n')
    routes.close(first)

    const second = fakeSocket('project')
    routes.open(second)

    expect(pty.ptys).toHaveLength(1)
    expect(pty.ptys[0]?.killed).toBe(false)
    expect(second.messages[0]).toMatchObject({ type: 'ready' })
    expect(terminalOutputText(second.messages)).toContain('streamed-output')

    service.dispose()
  })

  it('keeps terminal tab sessions isolated within the same workspace', async () => {
    const root = await fixtureRoot()
    await mkdir(path.join(root, 'project'))
    const pty = createFakePtyFactory()
    const service = testService(root, { ptyFactory: pty.factory })
    const routes = service.routes(auth())
    const first = fakeSocket('project', 'terminal-1')
    const second = fakeSocket('project', 'terminal-2')

    routes.open(first)
    routes.open(second)
    routes.message(first, { type: 'input', data: 'echo first\r' })
    routes.message(second, { type: 'input', data: 'echo second\r' })

    expect(pty.ptys).toHaveLength(2)
    expect(pty.ptys[0]?.writes).toEqual(['echo first\r'])
    expect(pty.ptys[1]?.writes).toEqual(['echo second\r'])

    service.dispose()
  })

  it('kills only the disposed terminal tab session', async () => {
    const root = await fixtureRoot()
    const pty = createFakePtyFactory()
    const service = testService(root, { ptyFactory: pty.factory })
    const routes = service.routes(auth())
    const first = fakeSocket('', 'terminal-1')
    const second = fakeSocket('', 'terminal-2')

    routes.open(first)
    routes.open(second)
    routes.message(first, { type: 'dispose' })

    expect(pty.ptys[0]?.killed).toBe(true)
    expect(pty.ptys[1]?.killed).toBe(false)

    service.dispose()
  })

  it('kills the PTY when a detached session exceeds its idle TTL', async () => {
    const root = await fixtureRoot()
    const pty = createFakePtyFactory()
    const service = testService(root, { detachTtlMs: 0, ptyFactory: pty.factory })
    const routes = service.routes(auth())
    const ws = fakeSocket('')

    routes.open(ws)
    routes.close(ws)
    await Bun.sleep(10)

    expect(pty.ptys[0]?.killed).toBe(true)
  })

  // TODO(pty-in-tests): we could not get the real node-pty bridge to work in the
  // test environment. The PTY never emits output when its `node` process is spawned
  // from a Vitest worker (it works under `bun test`, the main process). Verified it
  // is node-pty itself, not resolution/stdio. Look into this and re-enable — the
  // other terminal tests cover the service via FakePty in the meantime.
  it.skip('streams output through the default Node-backed PTY bridge', async () => {
    const root = await fixtureRoot()
    const service = testService(root, {
      env: {
        HOME: root,
        PATH: process.env.PATH,
        SHELL: 'sh',
      },
    })
    const routes = service.routes(auth())
    const ws = fakeSocket('')

    routes.open(ws)
    routes.message(ws, {
      data: 'printf platform-terminal-ready\\n\nexit\n',
      type: 'input',
    })

    await waitForTerminalOutput(ws.messages, 'platform-terminal-ready')
    routes.close(ws)
    service.dispose()

    expect(terminalOutputText(ws.messages)).toContain('platform-terminal-ready')
  })
})

function testService(
  root: string,
  options: {
    detachTtlMs?: number
    env?: NodeJS.ProcessEnv
    ptyFactory?: TerminalPtyFactory
  } = {},
) {
  return new TerminalService({
    paths: createWorkspacePaths(root),
    ...options,
  })
}

async function fixtureRoot() {
  const root = await mkdtemp(path.join(tmpdir(), 'platform-terminal-'))
  roots.push(root)
  return root
}

function auth() {
  return createAuthConfig({ allowedOrigins: [TRUSTED_ORIGIN] })
}

function fakeSocket(root: string, session?: string) {
  const messages: TerminalServerMessage[] = []
  const raw = {}
  return {
    closed: false,
    data: {
      headers: { origin: TRUSTED_ORIGIN },
      query: { root, session },
    },
    messages,
    raw,
    close() {
      this.closed = true
    },
    send(message: string) {
      messages.push(JSON.parse(message) as TerminalServerMessage)
    },
  }
}

function createFakePtyFactory({
  failShells = new Set<string>(),
}: {
  failShells?: ReadonlySet<string>
} = {}) {
  const ptys: FakePty[] = []
  const spawns: Parameters<TerminalPtyFactory>[0][] = []
  const factory: TerminalPtyFactory = (options) => {
    spawns.push(options)
    if (failShells.has(options.shell)) throw new Error('missing shell')

    const pty = new FakePty()
    ptys.push(pty)
    return pty
  }

  return { factory, ptys, spawns }
}

async function waitForTerminalOutput(messages: readonly TerminalServerMessage[], text: string) {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    if (terminalOutputText(messages).includes(text)) return

    await Bun.sleep(25)
  }

  throw new Error(`Timed out waiting for terminal output: ${text}`)
}

function terminalOutputText(messages: readonly TerminalServerMessage[]) {
  return messages
    .filter((message) => message.type === 'output')
    .map((message) => message.data)
    .join('')
}

class FakePty {
  killed = false
  readonly resizes: Array<[number, number]> = []
  readonly writes: string[] = []
  private readonly dataListeners = new Set<(data: string) => void>()
  private readonly exitListeners = new Set<(event: TerminalPtyExitEvent) => void>()

  kill() {
    this.killed = true
  }

  emit(data: string) {
    for (const listener of this.dataListeners) listener(data)
  }

  onData(listener: (data: string) => void) {
    this.dataListeners.add(listener)
    return { dispose: () => this.dataListeners.delete(listener) }
  }

  onExit(listener: (event: TerminalPtyExitEvent) => void) {
    this.exitListeners.add(listener)
    return { dispose: () => this.exitListeners.delete(listener) }
  }

  resize(cols: number, rows: number) {
    this.resizes.push([cols, rows])
  }

  write(data: string) {
    this.writes.push(data)
  }
}
