import { mkdir, realpath, rm, symlink } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  TERMINAL_MAX_COLS,
  TERMINAL_MIN_ROWS,
  type TerminalServerMessage,
} from '@workspace/contracts'

import { createOrchestrationFixture } from '../../../test/factories/orchestration'
import { requireWorktree } from '../../orchestration/read-model'
import { createAuthConfig } from '../../auth'
import { createWorkspacePaths, type WorkspacePaths } from '../../fs/path'
import { TerminalService, type TerminalPtyExitEvent, type TerminalPtyFactory } from '../service'

const TRUSTED_ORIGIN = 'http://localhost:5173'
const fixtures = new Map<string, Awaited<ReturnType<typeof createOrchestrationFixture>>>()
const registrations = new Map<string, string>()
const services: TerminalService[] = []

afterEach(async () => {
  services.splice(0).forEach((service) => service.dispose())
  await Promise.all([...fixtures.values()].map((fixture) => fixture.close()))
  fixtures.clear()
  registrations.clear()
})

describe('terminal service', () => {
  // The WS transport shares the origin predicate with HTTP, so it has to reject
  // an off-allowlist loopback origin too - and reject it before spawning a PTY.
  it('closes a websocket opened from an untrusted loopback origin', async () => {
    const root = await fixtureRoot()
    const pty = createFakePtyFactory()
    const service = testService(root, { env: {}, ptyFactory: pty.factory })
    const ws = fakeSocket(root, '', undefined, 'http://localhost:9999')

    await service.routes(auth()).open(ws)

    expect(ws.closed).toBe(true)
    expect(pty.spawns).toEqual([])
  })

  it('spawns the user shell in the resolved workspace cwd', async () => {
    const root = await fixtureRoot()
    const pty = createFakePtyFactory()
    const service = testService(root, {
      env: { SHELL: '/bin/zsh' },
      ptyFactory: pty.factory,
    })
    const ws = fakeSocket(root, 'project')

    await service.routes(auth()).open(ws)

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

  it('opens a registered canonical checkout beneath a symlinked workspace root', async () => {
    const root = await fixtureRoot()
    const alias = path.join(path.dirname(root), 'workspace-alias')
    await symlink(root, alias, 'dir')
    const pty = createFakePtyFactory()
    const service = testService(root, {
      env: { SHELL: '/bin/sh' },
      paths: createWorkspacePaths(alias),
      ptyFactory: pty.factory,
    })
    const ws = fakeSocket(root, 'project')

    await service.routes(auth()).open(ws)

    const canonicalPath = await realpath(path.join(root, 'project'))
    expect(ws.closed).toBe(false)
    expect(pty.spawns).toEqual([expect.objectContaining({ cwd: canonicalPath })])
    expect(ws.messages[0]).toMatchObject({ type: 'ready', cwd: canonicalPath })
  })

  it('refuses a registered checkout replaced by a symlink outside the real workspace root', async () => {
    const root = await fixtureRoot()
    const outside = await fixtureRoot()
    await rm(path.join(root, 'project'), { recursive: true })
    await symlink(outside, path.join(root, 'project'), 'dir')
    const pty = createFakePtyFactory()
    const service = testService(root, { ptyFactory: pty.factory })
    const ws = fakeSocket(root, 'project')

    await service.routes(auth()).open(ws)

    expect(ws.closed).toBe(true)
    expect(pty.spawns).toEqual([])
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
    const ws = fakeSocket(root, '')

    await service.routes(auth()).open(ws)

    expect(pty.spawns.map((spawn) => spawn.shell)).toEqual(['bash', 'sh'])
    expect(ws.messages[0]).toMatchObject({ shell: 'sh', type: 'ready' })
  })

  it('ignores malformed messages and normalizes resize bounds', async () => {
    const root = await fixtureRoot()
    const pty = createFakePtyFactory()
    const service = testService(root, { ptyFactory: pty.factory })
    const routes = service.routes(auth())
    const ws = fakeSocket(root, '')

    await routes.open(ws)
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
    const ws = fakeSocket(root, '')

    await routes.open(ws)
    routes.close(ws)

    expect(pty.ptys).toHaveLength(1)
    expect(pty.ptys[0]?.killed).toBe(false)

    service.dispose()

    expect(pty.ptys[0]?.killed).toBe(true)
  })

  it('does not spawn a PTY when disposed during worktree resolution', async () => {
    const root = await fixtureRoot()
    const resolution = Promise.withResolvers<void>()
    const pty = createFakePtyFactory()
    const service = testService(root, {
      beforeWorktreeResolution: resolution.promise,
      env: {},
      ptyFactory: pty.factory,
    })
    const ws = fakeSocket(root, '')
    const opening = service.routes(auth()).open(ws)

    service.dispose()
    resolution.resolve()
    await opening

    expect(pty.spawns).toEqual([])
    expect(ws.closed).toBe(true)
  })

  it('reuses the PTY and replays buffered output on reconnect', async () => {
    const root = await fixtureRoot()
    const pty = createFakePtyFactory()
    const service = testService(root, { ptyFactory: pty.factory })
    const routes = service.routes(auth())
    const first = fakeSocket(root, 'project')

    await routes.open(first)
    pty.ptys[0]?.emit('streamed-output\r\n')
    routes.close(first)

    const second = fakeSocket(root, 'project')
    await routes.open(second)

    expect(pty.ptys).toHaveLength(1)
    expect(pty.ptys[0]?.killed).toBe(false)
    expect(second.messages[0]).toMatchObject({ type: 'ready' })
    expect(terminalOutputText(second.messages)).toContain('streamed-output')

    service.dispose()
  })

  it('keeps terminal tab sessions isolated within the same workspace', async () => {
    const root = await fixtureRoot()
    const pty = createFakePtyFactory()
    const service = testService(root, { ptyFactory: pty.factory })
    const routes = service.routes(auth())
    const first = fakeSocket(root, 'project', 'terminal-1')
    const second = fakeSocket(root, 'project', 'terminal-2')

    await routes.open(first)
    await routes.open(second)
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
    const first = fakeSocket(root, '', 'terminal-1')
    const second = fakeSocket(root, '', 'terminal-2')

    await routes.open(first)
    await routes.open(second)
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
    const ws = fakeSocket(root, '')

    await routes.open(ws)
    routes.close(ws)
    await Bun.sleep(10)

    expect(pty.ptys[0]?.killed).toBe(true)
  })

  // The bridge spawns a real Node binary (not Bun's `--bun` node shim, whose
  // node-pty master-fd socket is broken), so the native PTY works under Vitest.
  it('streams output through the default Node-backed PTY bridge', async () => {
    const root = await fixtureRoot()
    const service = testService(root, {
      env: {
        HOME: root,
        PATH: process.env.PATH,
        SHELL: 'sh',
      },
    })
    const routes = service.routes(auth())
    const ws = fakeSocket(root, '')

    await routes.open(ws)
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
    beforeWorktreeResolution?: Promise<void>
    detachTtlMs?: number
    env?: NodeJS.ProcessEnv
    paths?: WorkspacePaths
    ptyFactory?: TerminalPtyFactory
  } = {},
) {
  const fixture = fixtures.get(root)
  if (!fixture) throw new TypeError('Missing fixture')
  const { beforeWorktreeResolution, ...serviceOptions } = options
  const service = new TerminalService({
    paths: createWorkspacePaths(root),
    resolveWorktree: async (id) => {
      await beforeWorktreeResolution
      return requireWorktree(await fixture.engine.readModelSnapshot(), id).canonicalPath
    },
    ...serviceOptions,
  })
  services.push(service)
  return service
}

async function fixtureRoot() {
  const fixture = await createOrchestrationFixture()
  const root = fixture.checkout
  fixtures.set(root, fixture)
  await mkdir(path.join(root, 'project'))
  for (const checkout of [root, path.join(root, 'project')]) {
    const result = (await fixture.register(checkout)).result
    if (!result) throw new TypeError('Missing registration')
    registrations.set(checkout, result.worktreeId)
  }
  return root
}

function auth() {
  return createAuthConfig({ allowedOrigins: [TRUSTED_ORIGIN] })
}

function fakeSocket(
  root: string,
  subdirectory: string,
  session = 'terminal-default',
  origin: string = TRUSTED_ORIGIN,
) {
  const messages: TerminalServerMessage[] = []
  const raw = {}
  return {
    closed: false,
    data: {
      headers: { origin },
      query: { worktreeId: registrations.get(path.join(root, subdirectory)), terminalId: session },
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
    if (failShells.has(options.shell)) throw new TypeError('missing shell')

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

  throw new TypeError(`Timed out waiting for terminal output: ${text}`)
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
