import * as v from 'valibot'
import { mkdir, realpath, rm, symlink } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  TERMINAL_MAX_COLS,
  TERMINAL_MIN_ROWS,
  type TerminalServerMessage,
  worktreeIdSchema,
} from '@workspace/contracts'

import { createOrchestrationFixture } from '../../../test/factories/orchestration'
import { requireWorktree } from '../../orchestration/read-model'
import { projectionTerminalLeases } from '../../db/schema'
import { createAuthConfig } from '../../auth'
import { createWorkspacePaths, type WorkspacePaths } from '../../fs/path'
import {
  NodePtyBridge,
  TerminalService,
  type TerminalPtyExitEvent,
  type TerminalPtyFactory,
} from '../service'

const TRUSTED_ORIGIN = 'http://localhost:5173'
const fixtures = new Map<string, Awaited<ReturnType<typeof createOrchestrationFixture>>>()
const registrations = new Map<string, string>()
const services: TerminalService[] = []

afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.dispose()))
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
    expect(ws.closeDetails).toEqual({ code: 1008, reason: 'unauthorized' })
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
    expect(ws.closeDetails).toEqual({ code: 1008, reason: 'invalid-root' })
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

    await service.dispose()

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

    await service.dispose()
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

    await service.dispose()
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

    await service.dispose()
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

    await expect.poll(() => pty.ptys[0]?.killed).toBe(true)
    expect(pty.ptys[1]?.killed).toBe(false)

    await service.dispose()
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

  it('persists request and claim before the PTY factory can spawn', async () => {
    const root = await fixtureRoot()
    const fixture = requiredFixture(root)
    const observations: string[] = []
    const pty = createFakePtyFactory({
      onSpawn: () => {
        observations.push(
          ...fixture.database
            .select()
            .from(projectionTerminalLeases)
            .all()
            .map((lease) => lease.state),
        )
      },
    })
    const service = testService(root, { ptyFactory: pty.factory })
    await service.routes(auth()).open(fakeSocket(root, ''))
    expect(observations).toEqual(['claimed'])
  })

  it('holds process ownership after exit until a failed end transaction is retried successfully', async () => {
    const root = await fixtureRoot()
    const fixture = requiredFixture(root)
    const worktreeId = v.parse(worktreeIdSchema, registrations.get(root))
    const pty = createFakePtyFactory()
    const service = testService(root, { ptyFactory: pty.factory })
    await service.routes(auth()).open(fakeSocket(root, ''))
    fixture.sqlite
      .exec(`CREATE TEMP TRIGGER terminal_end_failure BEFORE UPDATE ON projection_terminal_leases
      WHEN NEW.state = 'ended' BEGIN SELECT RAISE(FAIL, 'storage failure'); END`)
    pty.ptys[0]?.exit(0)
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(service.hasWorktreeRuntime(worktreeId)).toBe(true)
    expect(
      requireWorktree(await fixture.engine.readModelSnapshot(), worktreeId).activeTerminalCount,
    ).toBe(1)
    expect(fixture.engine.worktreeExecutionGate.tryAcquireExclusive(worktreeId)).toEqual({
      acquired: false,
      reason: 'active-terminal',
    })
    fixture.sqlite.exec('DROP TRIGGER terminal_end_failure')
    await expect.poll(() => service.hasWorktreeRuntime(worktreeId)).toBe(false)
    expect(
      requireWorktree(await fixture.engine.readModelSnapshot(), worktreeId).activeTerminalCount,
    ).toBe(0)
  })

  it('keeps its durable lease and gate through detach and kill without positive exit', async () => {
    const root = await fixtureRoot()
    const fixture = requiredFixture(root)
    const worktreeId = v.parse(worktreeIdSchema, registrations.get(root))
    const pty = createFakePtyFactory()
    const service = testService(root, { ptyFactory: pty.factory })
    const routes = service.routes(auth())
    const socket = fakeSocket(root, '')
    await routes.open(socket)
    expect(
      requireWorktree(await fixture.engine.readModelSnapshot(), worktreeId).activeTerminalCount,
    ).toBe(1)
    expect(fixture.engine.worktreeExecutionGate.tryAcquireExclusive(worktreeId)).toEqual({
      acquired: false,
      reason: 'active-terminal',
    })
    routes.close(socket)
    await service.dispose()
    expect(pty.ptys[0]?.killed).toBe(true)
    expect(service.hasWorktreeRuntime(worktreeId)).toBe(true)
    expect(
      requireWorktree(await fixture.engine.readModelSnapshot(), worktreeId).activeTerminalCount,
    ).toBe(1)
    expect([...(await fixture.engine.readModelSnapshot()).terminalLeases.values()][0]?.state).toBe(
      'termination-requested',
    )
    pty.ptys[0]?.exit(0)
    await expect.poll(() => service.hasWorktreeRuntime(worktreeId)).toBe(false)
    expect(
      requireWorktree(await fixture.engine.readModelSnapshot(), worktreeId).activeTerminalCount,
    ).toBe(0)
    const exclusive = fixture.engine.worktreeExecutionGate.tryAcquireExclusive(worktreeId)
    expect(exclusive.acquired).toBe(true)
    if (exclusive.acquired) exclusive.release()
  })

  it.each([false, true])(
    'requires PTY acknowledgement before bridge exit releases ownership (acknowledged=%s)',
    async (acknowledged) => {
      const root = await fixtureRoot()
      const fixture = requiredFixture(root)
      const worktreeId = v.parse(worktreeIdSchema, registrations.get(root))
      const output = new TransformStream<Uint8Array, Uint8Array>()
      const exited = Promise.withResolvers<number>()
      const service = testService(root, {
        ptyFactory: (options) =>
          new NodePtyBridge(options, () => ({
            exited: exited.promise,
            stdin: { write: () => 0, flush: () => 0 },
            stdout: output.readable,
            stderr: new ReadableStream({ start: (controller) => controller.close() }),
            kill: () => {},
          })),
      })
      await service.routes(auth()).open(fakeSocket(root, ''))
      await service.dispose()
      const writer = output.writable.getWriter()
      const message = acknowledged
        ? { type: 'exit', exitCode: 0 }
        : { type: 'error', message: 'PTY kill failed while shell was still alive' }
      await writer.write(new TextEncoder().encode(`${JSON.stringify(message)}\n`))
      await writer.close()
      exited.resolve(0)
      await new Promise<void>((resolve) => setImmediate(resolve))
      await expect.poll(() => service.hasWorktreeRuntime(worktreeId)).toBe(!acknowledged)
      const worktree = requireWorktree(await fixture.engine.readModelSnapshot(), worktreeId)
      expect(worktree.activeTerminalCount).toBe(acknowledged ? 0 : 1)
      const lease = fixture.engine.worktreeExecutionGate.tryAcquireExclusive(worktreeId)
      expect(lease.acquired).toBe(acknowledged)
      if (lease.acquired) lease.release()
    },
  )

  it('ends a requested lease when cleanup already holds the execution gate', async () => {
    const root = await fixtureRoot()
    const fixture = requiredFixture(root)
    const worktreeId = v.parse(worktreeIdSchema, registrations.get(root))
    const exclusive = fixture.engine.worktreeExecutionGate.tryAcquireExclusive(worktreeId)
    expect(exclusive.acquired).toBe(true)
    const pty = createFakePtyFactory()
    const service = testService(root, { ptyFactory: pty.factory })
    const socket = fakeSocket(root, '')
    await service.routes(auth()).open(socket)
    expect(socket.closed).toBe(true)
    expect(pty.spawns).toHaveLength(0)
    expect(
      requireWorktree(await fixture.engine.readModelSnapshot(), worktreeId).activeTerminalCount,
    ).toBe(0)
    expect([...(await fixture.engine.readModelSnapshot()).terminalLeases.values()][0]?.state).toBe(
      'ended',
    )
    if (exclusive.acquired) exclusive.release()
  })

  it('never spawns for a socket closed while its durable lease is being claimed', async () => {
    const root = await fixtureRoot()
    const fixture = requiredFixture(root)
    const worktreeId = v.parse(worktreeIdSchema, registrations.get(root))
    const claimed = Promise.withResolvers<void>()
    const resume = Promise.withResolvers<void>()
    const pty = createFakePtyFactory()
    const service = testService(root, {
      ptyFactory: pty.factory,
      lifecycle: {
        begin: async (id) => {
          const lease = await fixture.engine.beginTerminalLease(id)
          claimed.resolve()
          await resume.promise
          return lease
        },
      },
    })
    const routes = service.routes(auth())
    const socket = fakeSocket(root, '')
    const opening = routes.open(socket)
    await claimed.promise
    routes.close(socket)
    resume.resolve()
    await opening
    expect(pty.spawns).toHaveLength(0)
    expect(
      requireWorktree(await fixture.engine.readModelSnapshot(), worktreeId).activeTerminalCount,
    ).toBe(0)
  })

  it('does not announce ready or activate when PTY exit is delivered during subscription', async () => {
    const root = await fixtureRoot()
    const fixture = requiredFixture(root)
    const worktreeId = v.parse(worktreeIdSchema, registrations.get(root))
    const pty = createFakePtyFactory({ synchronousExit: 0 })
    const service = testService(root, { ptyFactory: pty.factory })
    const socket = fakeSocket(root, '')
    await service.routes(auth()).open(socket)
    expect(socket.messages.map((message) => message.type)).toEqual(['exit'])
    expect(service.hasWorktreeRuntime(worktreeId)).toBe(false)
    expect([...(await fixture.engine.readModelSnapshot()).terminalLeases.values()][0]?.state).toBe(
      'ended',
    )
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
    const worktreeId = v.parse(worktreeIdSchema, registrations.get(root))
    await expect.poll(() => service.hasWorktreeRuntime(worktreeId)).toBe(false)
    routes.close(ws)
    await service.dispose()

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
    lifecycle?: import('../lease').TerminalLeaseBoundary
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
    lifecycle: { begin: (id) => fixture.engine.beginTerminalLease(id) },
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
  const closeDetails: { code: number | undefined; reason: string | undefined } = {
    code: undefined,
    reason: undefined,
  }
  const raw = {}
  return {
    closed: false,
    closeDetails,
    data: {
      headers: { origin },
      query: { worktreeId: registrations.get(path.join(root, subdirectory)), terminalId: session },
    },
    messages,
    raw,
    close(code?: number, reason?: string) {
      this.closed = true
      this.closeDetails = { code, reason }
    },
    send(message: string) {
      messages.push(JSON.parse(message) as TerminalServerMessage)
    },
  }
}

function createFakePtyFactory({
  failShells = new Set<string>(),
  synchronousExit,
  onSpawn,
}: {
  failShells?: ReadonlySet<string>
  synchronousExit?: number
  onSpawn?: () => void
} = {}) {
  const ptys: FakePty[] = []
  const spawns: Parameters<TerminalPtyFactory>[0][] = []
  const factory: TerminalPtyFactory = (options) => {
    spawns.push(options)
    onSpawn?.()
    if (failShells.has(options.shell)) throw new TypeError('missing shell')

    const pty = new FakePty(synchronousExit)
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

function requiredFixture(root: string) {
  const fixture = fixtures.get(root)
  if (!fixture) throw new TypeError('Missing fixture')
  return fixture
}

class FakePty {
  private readonly synchronousExit: number | undefined
  constructor(synchronousExit?: number) {
    this.synchronousExit = synchronousExit
  }
  killed = false
  readonly resizes: Array<[number, number]> = []
  readonly writes: string[] = []
  private readonly dataListeners = new Set<(data: string) => void>()
  private readonly exitListeners = new Set<(event: TerminalPtyExitEvent) => void>()

  kill() {
    this.killed = true
  }

  exit(exitCode: number) {
    for (const listener of this.exitListeners) listener({ exitCode })
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
    if (this.synchronousExit !== undefined) listener({ exitCode: this.synchronousExit })
    return { dispose: () => this.exitListeners.delete(listener) }
  }

  resize(cols: number, rows: number) {
    this.resizes.push([cols, rows])
  }

  write(data: string) {
    this.writes.push(data)
  }
}
