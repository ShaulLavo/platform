import type { TerminalExecutionLease, TerminalLeaseBoundary } from './lease'
import * as v from 'valibot'
import {
  terminalOpenInputSchema,
  type TerminalOpenInput,
  type WorktreeId,
} from '@workspace/contracts'
import { realpathSync } from 'node:fs'
import path from 'node:path'
import {
  isRecord,
  parseTerminalClientMessage,
  type TerminalClientMessage,
  type TerminalServerMessage,
} from '@workspace/contracts'

import { authenticateWebSocketData, type AuthConfig } from '../auth'
import { FsError, isFsError } from '../fs/errors'
import type { WorkspacePaths } from '../fs/path'
import { elapsedMs, limitText, recordProcessInfo, recordProcessWarning } from '../observability'

export type TerminalPty = {
  kill(signal?: string): void
  onData(listener: (data: string) => void): TerminalPtyDisposable
  onExit(listener: (event: TerminalPtyExitEvent) => void): TerminalPtyDisposable
  resize(cols: number, rows: number): void
  write(data: string): void
}

export type TerminalPtyDisposable = {
  dispose(): void
}

export type TerminalPtyExitEvent = {
  exitCode: number
  signal?: number
}

type TerminalPtySpawnOptions = {
  cols: number
  cwd: string
  env: NodeJS.ProcessEnv
  rows: number
  shell: string
}

export type TerminalPtyFactory = (options: TerminalPtySpawnOptions) => TerminalPty

type TerminalBridgeMessage =
  | { type: 'output'; data: string }
  | { type: 'exit'; exitCode: number | null }
  | { type: 'error'; message: string }

type TerminalBridgeProcess = {
  exited: Promise<number>
  stdin: Pick<Bun.FileSink, 'write' | 'flush'>
  stdout: ReadableStream<Uint8Array>
  stderr: ReadableStream<Uint8Array>
  kill: (signal?: NodeJS.Signals) => void
}

export type TerminalServiceOptions = {
  detachTtlMs?: number
  env?: NodeJS.ProcessEnv
  paths: WorkspacePaths
  resolveWorktree: (worktreeId: WorktreeId) => Promise<string>
  lifecycle: TerminalLeaseBoundary
  ptyFactory?: TerminalPtyFactory
}

type TerminalConnection = {
  key: object
  close: () => void
  send: (message: string) => void
}

const DEFAULT_COLS = 80
const DEFAULT_ROWS = 24
const TERMINAL_REPLAY_BUFFER_BYTES = 256 * 1024
const TERMINAL_DETACHED_TTL_MS = 10 * 60 * 1000

export class TerminalService {
  private readonly detachTtlMs: number
  private readonly env: NodeJS.ProcessEnv
  private readonly paths: WorkspacePaths
  private readonly resolveWorktree: TerminalServiceOptions['resolveWorktree']
  private readonly lifecycle: TerminalLeaseBoundary
  private readonly opening = new WeakSet<object>()
  private readonly starts = new Map<string, Promise<void>>()
  private readonly persistentSessions = new Map<string, TerminalSession>()
  private readonly ptyFactory: TerminalPtyFactory
  private disposed = false

  constructor({
    detachTtlMs = TERMINAL_DETACHED_TTL_MS,
    env = process.env,
    paths,
    resolveWorktree,
    lifecycle,
    ptyFactory = defaultTerminalPtyFactory,
  }: TerminalServiceOptions) {
    this.detachTtlMs = detachTtlMs
    this.env = env
    this.paths = paths
    this.resolveWorktree = resolveWorktree
    this.lifecycle = lifecycle
    this.ptyFactory = ptyFactory
  }

  routes(auth: AuthConfig) {
    return {
      open: (ws: unknown) => this.open(ws, auth),
      message: (ws: unknown, message: unknown) => this.message(ws, message),
      close: (ws: unknown) => this.close(ws),
    }
  }

  async dispose() {
    this.disposed = true
    await Promise.all([...this.persistentSessions.values()].map((session) => session.dispose()))
  }

  hasWorktreeRuntime(worktreeId: WorktreeId) {
    return [...this.persistentSessions.values()].some(
      (session) => session.worktreeId === worktreeId,
    )
  }

  private async open(ws: unknown, auth: AuthConfig) {
    const socket = terminalWebSocketObject(ws)
    if (!socket) return
    const authError = authenticateWebSocketData(socket.data, auth)
    if (authError) {
      recordProcessWarning('terminal.session.rejected', {
        area: 'terminal',
        errorCode: authError.code,
        operation: 'open',
        outcome: 'auth_failed',
        status: authError.statusCode,
      })
      socket.close(1008, 'unauthorized')
      return
    }

    if (this.disposed || !socket.input) {
      socket.close()
      return
    }
    this.opening.add(socket.key)
    const root = await this.resolveWorktree(socket.input.worktreeId)
      .then((worktreePath) => this.resolveRoot(worktreePath))
      .catch((error: unknown) => {
        recordProcessWarning('terminal.session.rejected', {
          area: 'terminal',
          operation: 'open',
          outcome: 'invalid_worktree',
          error,
        })
        return null
      })
    if (!this.opening.has(socket.key)) return
    if (this.disposed) {
      socket.close()
      return
    }
    if (!root) {
      recordProcessWarning('terminal.session.rejected', {
        area: 'terminal',
        operation: 'open',
        outcome: 'invalid_root',
      })
      socket.close(1008, 'invalid-root')
      return
    }

    const connection: TerminalConnection = {
      key: socket.key,
      close: socket.close,
      send: socket.send,
    }
    const sessionId = socket.input.terminalId
    const worktreeId = socket.input.worktreeId
    const sessionKey = terminalSessionKey(worktreeId, sessionId)
    const previous = this.starts.get(sessionKey)
    const start = Promise.resolve(previous)
      .catch(() => {})
      .then(() =>
        this.openSession({
          sessionKey,
          worktreeId,
          sessionId,
          root,
          socket,
          connection,
        }),
      )
    this.starts.set(sessionKey, start)
    try {
      await start
    } catch (error) {
      recordProcessWarning('terminal.session.rejected', {
        area: 'terminal',
        operation: 'open',
        error,
      })
      socket.close(1008, 'worktree-unavailable')
    } finally {
      this.opening.delete(socket.key)
      if (this.starts.get(sessionKey) === start) this.starts.delete(sessionKey)
    }
  }

  private async openSession({
    sessionKey,
    worktreeId,
    sessionId,
    root,
    socket,
    connection,
  }: {
    sessionKey: string
    worktreeId: WorktreeId
    sessionId: string
    root: { absolutePath: string; relativePath: string }
    socket: NonNullable<ReturnType<typeof terminalWebSocketObject>>
    connection: TerminalConnection
  }) {
    if (this.disposed || !this.opening.has(socket.key)) return
    const existing = this.persistentSessions.get(sessionKey)
    if (existing) {
      socketSessions.set(socket.key, existing)
      existing.attach(connection)
      return
    }

    if (this.disposed) return
    const lease = await this.lifecycle.begin(worktreeId)
    if (this.disposed || !this.opening.has(socket.key)) {
      await lease.end()
      return
    }
    const session = new TerminalSession({
      lease,
      cwd: root.absolutePath,
      cols: socket.input?.cols ?? DEFAULT_COLS,
      rows: socket.input?.rows ?? DEFAULT_ROWS,
      worktreeId,
      detachTtlMs: this.detachTtlMs,
      env: this.env,
      onDispose: () => this.persistentSessions.delete(sessionKey),
      ptyFactory: this.ptyFactory,
      rootPath: root.relativePath,
      sessionId,
    })
    this.persistentSessions.set(sessionKey, session)
    socketSessions.set(socket.key, session)
    if (session.start(connection)) {
      await this.activateSession(session, lease)
      return
    }

    await session.dispose({ kill: false })
    socketSessions.delete(socket.key)
    socket.close()
  }

  private async activateSession(session: TerminalSession, lease: TerminalExecutionLease) {
    try {
      await lease.activate()
    } catch (error) {
      await session.dispose()
      throw error
    }
  }

  private message(ws: unknown, message: unknown) {
    const socket = terminalWebSocketObject(ws)
    if (!socket) return

    const session = socketSessions.get(socket.key)
    if (!session) return

    session.handleMessage(message)
  }

  private close(ws: unknown) {
    const socket = terminalWebSocketObject(ws)
    if (!socket) return

    this.opening.delete(socket.key)
    const session = socketSessions.get(socket.key)
    socketSessions.delete(socket.key)
    session?.detach(socket.key)
  }

  private resolveRoot(root: string) {
    try {
      const canonicalPath = realpathSync(root)
      this.paths.assertRealInside(canonicalPath)
      return {
        absolutePath: canonicalPath,
        relativePath: this.paths.toRealRelative(canonicalPath),
      }
    } catch (error) {
      if (isFsError(error)) return null

      throw error
    }
  }
}

export class TerminalSession {
  readonly worktreeId: WorktreeId
  private readonly lease: TerminalExecutionLease
  private terminating = false
  private disposal = Promise.resolve()
  private readonly cols: number
  private readonly rows: number
  private readonly cwd: string
  private readonly detachTtlMs: number
  private readonly env: NodeJS.ProcessEnv
  private readonly onDispose: (session: TerminalSession) => void
  private readonly ptyFactory: TerminalPtyFactory
  private readonly rootPath: string
  private readonly sessionId: string
  private readonly outputBufferChunks: string[] = []
  private connection: TerminalConnection | null = null
  private dataDisposable: TerminalPtyDisposable | null = null
  private detachTimer: ReturnType<typeof setTimeout> | null = null
  private disposed = false
  private errorMessage: string | null = null
  private exitDisposable: TerminalPtyDisposable | null = null
  private exitCode: number | null = null
  private inputBytes = 0
  private inputMessageCount = 0
  private openedAt = performance.now()
  private outputBufferBytes = 0
  private outputBytes = 0
  private outputMessageCount = 0
  private pty: TerminalPty | null = null
  private resizeCount = 0
  private serverMessageCount = 0
  private shell: string | null = null

  constructor({
    lease,
    cwd,
    cols,
    rows,
    worktreeId,
    detachTtlMs,
    env,
    onDispose,
    ptyFactory,
    rootPath,
    sessionId,
  }: {
    lease: TerminalExecutionLease
    cwd: string
    cols: number
    rows: number
    worktreeId: WorktreeId
    detachTtlMs: number
    env: NodeJS.ProcessEnv
    onDispose: (session: TerminalSession) => void
    ptyFactory: TerminalPtyFactory
    rootPath: string
    sessionId: string
  }) {
    this.lease = lease
    this.cols = cols
    this.rows = rows
    this.cwd = cwd
    this.worktreeId = worktreeId
    this.detachTtlMs = detachTtlMs
    this.env = env
    this.onDispose = onDispose
    this.ptyFactory = ptyFactory
    this.rootPath = rootPath
    this.sessionId = sessionId
  }

  start(connection: TerminalConnection) {
    this.setConnection(connection)
    const spawnResult = this.spawnPty()
    if (!spawnResult) return false

    this.pty = spawnResult.pty
    this.shell = spawnResult.shell
    this.dataDisposable = this.pty.onData((data) => this.handleOutput(data))
    this.exitDisposable = this.pty.onExit((event) => {
      this.exitCode = event.exitCode
      this.emit({ type: 'exit', exitCode: event.exitCode })
      void this.dispose({ kill: false })
    })
    if (this.disposed) {
      this.exitDisposable.dispose()
      return false
    }
    this.emitReady()
    return true
  }

  attach(connection: TerminalConnection) {
    if (this.disposed || this.terminating) {
      connection.close()
      return
    }

    this.setConnection(connection)
    this.emitReady()
    const buffered = this.outputBufferChunks.join('')
    if (buffered) this.emit({ type: 'output', data: buffered })
  }

  detach(key: object) {
    if (!this.connection || this.connection.key !== key) return

    this.connection = null
    this.startDetachTimer()
  }

  handleMessage(message: unknown) {
    if (this.disposed || this.terminating) return

    const parsed = parseTerminalClientMessage(message)
    if (!parsed) return
    this.recordClientMessage(parsed)
    if (parsed.type === 'dispose') {
      void this.dispose({ kill: true })
      return
    }
    if (!this.pty) return

    handleTerminalClientMessage(this.pty, parsed)
  }

  dispose(options: { kill?: boolean } = {}): Promise<void> {
    if (this.disposed) return this.disposal
    this.cancelDetachTimer()
    if ((options.kill ?? true) && this.pty && this.exitCode === null)
      return this.requestTermination()

    this.disposed = true
    this.dataDisposable?.dispose()
    this.exitDisposable?.dispose()
    const connection = this.connection
    this.connection = null
    connection?.close()
    this.disposal = this.lease
      .end()
      .then(() => {
        this.recordSession()
        this.onDispose(this)
      })
      .catch((error: unknown) => {
        recordProcessWarning('terminal.session.end_failed', {
          area: 'terminal',
          worktreeId: this.worktreeId,
          error,
        })
      })
    return this.disposal
  }

  private requestTermination() {
    if (this.terminating) return this.disposal
    this.terminating = true
    this.disposal = this.lease
      .terminate()
      .then(() => {
        if (this.exitCode === null) this.pty?.kill()
      })
      .catch((error: unknown) => {
        recordProcessWarning('terminal.session.termination_failed', {
          area: 'terminal',
          worktreeId: this.worktreeId,
          error,
        })
      })
    return this.disposal
  }

  private emitReady() {
    if (this.shell === null) return

    this.emit({ type: 'ready', cwd: this.cwd, shell: this.shell })
  }

  private setConnection(connection: TerminalConnection) {
    this.cancelDetachTimer()
    if (this.connection && this.connection.key !== connection.key) {
      this.connection.close()
    }
    this.connection = connection
  }

  private startDetachTimer() {
    this.cancelDetachTimer()
    this.detachTimer = setTimeout(() => {
      this.detachTimer = null
      void this.dispose({ kill: true })
    }, this.detachTtlMs)
    this.detachTimer.unref?.()
  }

  private cancelDetachTimer() {
    if (!this.detachTimer) return

    clearTimeout(this.detachTimer)
    this.detachTimer = null
  }

  private handleOutput(data: string) {
    this.appendOutput(data)
    this.emit({ type: 'output', data })
  }

  private appendOutput(data: string) {
    this.outputBufferChunks.push(data)
    this.outputBufferBytes += Buffer.byteLength(data, 'utf8')
    while (
      this.outputBufferBytes > TERMINAL_REPLAY_BUFFER_BYTES &&
      this.outputBufferChunks.length > 1
    ) {
      const removed = this.outputBufferChunks.shift()
      if (removed === undefined) break

      this.outputBufferBytes -= Buffer.byteLength(removed, 'utf8')
    }
  }

  private spawnPty() {
    const candidates = terminalShellCandidates(this.env)
    let lastError: unknown = null

    for (const shell of candidates) {
      const result = this.trySpawnPty(shell)
      if (result.pty) return result

      lastError = result.error
    }

    this.emit({
      message: this.recordSpawnError(lastError),
      type: 'error',
    })
    return null
  }

  private trySpawnPty(shell: string) {
    try {
      return {
        pty: this.ptyFactory({
          cols: this.cols,
          cwd: this.cwd,
          env: terminalEnv(this.env),
          rows: this.rows,
          shell,
        }),
        shell,
      }
    } catch (error) {
      return { error, pty: null, shell }
    }
  }

  private emit(message: TerminalServerMessage) {
    this.recordServerMessage(message)
    this.connection?.send(JSON.stringify(message))
  }

  private recordClientMessage(message: TerminalClientMessage) {
    if (message.type === 'dispose') return
    if (message.type === 'input') {
      this.inputBytes += Buffer.byteLength(message.data, 'utf8')
      this.inputMessageCount += 1
      return
    }

    this.resizeCount += 1
  }

  private recordServerMessage(message: TerminalServerMessage) {
    this.serverMessageCount += 1
    if (message.type === 'output') {
      this.outputBytes += Buffer.byteLength(message.data, 'utf8')
      this.outputMessageCount += 1
      return
    }
    if (message.type === 'error') this.errorMessage = message.message
  }

  private recordSpawnError(error: unknown) {
    const message = terminalSpawnErrorMessage(error)
    this.errorMessage = message
    return message
  }

  private recordSession() {
    const outcome = terminalOutcome(this.exitCode, this.errorMessage)
    const context = {
      area: 'terminal',
      durationMs: elapsedMs(this.openedAt),
      errorMessage: this.errorMessage ? limitText(this.errorMessage, 500) : undefined,
      exitCode: this.exitCode,
      inputBytes: this.inputBytes,
      inputMessageCount: this.inputMessageCount,
      operation: 'session',
      outcome,
      outputBytes: this.outputBytes,
      outputMessageCount: this.outputMessageCount,
      resizeCount: this.resizeCount,
      rootPath: this.rootPath,
      serverMessageCount: this.serverMessageCount,
      sessionId: this.sessionId,
      shell: this.shell,
    }

    if (outcome === 'failed' || outcome === 'error') {
      recordProcessWarning('terminal.session', context)
      return
    }

    recordProcessInfo('terminal.session', context)
  }
}

const socketSessions = new WeakMap<object, TerminalSession>()

type TerminalWebSocket = {
  close(code?: number, reason?: string): unknown
  data: unknown
  key: object
  input: TerminalOpenInput | null
  send(message: string): unknown
}

function terminalWebSocketObject(value: unknown): TerminalWebSocket | null {
  if (!isRecord(value)) return null
  if (typeof value.send !== 'function') return null

  const close = value.close
  const send = value.send
  return {
    close: (code, reason) =>
      typeof close === 'function' ? close.call(value, code, reason) : undefined,
    data: value.data,
    key: websocketKey(value),
    input: openInputFromWebSocketData(value.data),
    send: (message) => send.call(value, message),
  }
}

function websocketKey(value: Record<string, unknown>): object {
  return isRecord(value.raw) ? value.raw : value
}

function openInputFromWebSocketData(data: unknown): TerminalOpenInput | null {
  const result = v.safeParse(terminalOpenInputSchema, {
    worktreeId: queryValueFromWebSocketData(data, 'worktreeId'),
    terminalId: queryValueFromWebSocketData(data, 'terminalId'),
    cols: optionalQueryNumber(data, 'cols'),
    rows: optionalQueryNumber(data, 'rows'),
  })
  return result.success ? result.output : null
}

function optionalQueryNumber(data: unknown, key: string) {
  const value = queryValueFromWebSocketData(data, key)
  return value === null ? undefined : Number(value)
}

function queryValueFromWebSocketData(data: unknown, key: string) {
  if (!isRecord(data)) return null
  if (isRecord(data.query) && typeof data.query[key] === 'string') {
    return data.query[key]
  }
  if (typeof data.url !== 'string') return null

  try {
    return new URL(data.url).searchParams.get(key)
  } catch {
    return null
  }
}

function terminalSessionKey(rootPath: string, sessionId: string) {
  return JSON.stringify([rootPath, sessionId])
}

function handleTerminalClientMessage(ptyProcess: TerminalPty, message: TerminalClientMessage) {
  if (message.type === 'input') {
    ptyProcess.write(message.data)
    return
  }
  if (message.type !== 'resize') return

  ptyProcess.resize(message.cols, message.rows)
}

function terminalShellCandidates(env: NodeJS.ProcessEnv) {
  if (process.platform === 'win32') {
    return uniqueShells([env.SHELL, env.COMSPEC, 'powershell.exe', 'cmd.exe'])
  }

  return uniqueShells([env.SHELL, 'bash', 'sh'])
}

function uniqueShells(shells: Array<string | undefined>) {
  return Array.from(new Set(shells.map((shell) => shell?.trim()).filter(isString)))
}

function terminalEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...env,
    COLORTERM: env.COLORTERM ?? 'truecolor',
    TERM: 'xterm-256color',
  }
}

function defaultTerminalPtyFactory({
  cols,
  cwd,
  env,
  rows,
  shell,
}: TerminalPtySpawnOptions): TerminalPty {
  return new NodePtyBridge({
    cols,
    cwd,
    env,
    rows,
    shell,
  })
}

function terminalSpawnErrorMessage(error: unknown) {
  if (error instanceof FsError) return error.message
  if (error instanceof Error) return error.message

  return 'failed to start terminal'
}

function terminalOutcome(exitCode: number | null, errorMessage: string | null) {
  if (errorMessage) return 'error'
  if (exitCode === 0) return 'exited'
  if (typeof exitCode === 'number') return 'failed'

  return 'closed'
}

function isString(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0
}

function killSignal(signal: string | undefined): NodeJS.Signals | undefined {
  if (!signal) return undefined

  return signal as NodeJS.Signals
}

export class NodePtyBridge implements TerminalPty {
  readonly #child
  readonly #cwd: string
  readonly #dataListeners = new Set<(data: string) => void>()
  readonly #encoder = new TextEncoder()
  readonly #exitListeners = new Set<(event: TerminalPtyExitEvent) => void>()
  readonly #stdin: TerminalBridgeProcess['stdin']
  #exitEmitted = false
  #bridgeExited = false
  #writeQueue = Promise.resolve()

  constructor(
    options: TerminalPtySpawnOptions,
    spawnBridge: (options: TerminalPtySpawnOptions) => TerminalBridgeProcess = spawnTerminalBridge,
  ) {
    this.#cwd = options.cwd
    this.#child = spawnBridge(options)
    this.#stdin = this.#child.stdin
    this.#startReaders()
    this.#sendCommand({ type: 'start', ...options })
  }

  kill(signal?: string) {
    this.#sendCommand({ signal, type: 'kill' })
    setTimeout(() => {
      if (this.#exitEmitted || this.#bridgeExited) return

      try {
        this.#child.kill(killSignal(signal))
      } catch (error) {
        recordProcessWarning('terminal.bridge.kill_failed', {
          area: 'terminal',
          cwd: this.#cwd,
          error,
        })
      }
    }, 250)
  }

  onData(listener: (data: string) => void): TerminalPtyDisposable {
    this.#dataListeners.add(listener)
    return { dispose: () => this.#dataListeners.delete(listener) }
  }

  onExit(listener: (event: TerminalPtyExitEvent) => void) {
    this.#exitListeners.add(listener)
    return { dispose: () => this.#exitListeners.delete(listener) }
  }

  resize(cols: number, rows: number) {
    this.#sendCommand({ cols, rows, type: 'resize' })
  }

  write(data: string) {
    this.#sendCommand({ data, type: 'input' })
  }

  #startReaders() {
    const output = readBridgeMessages(this.#child.stdout, (message) =>
      this.#handleBridgeMessage(message),
    ).catch((error: unknown) => this.#recordReadFailure(error))
    void readBridgeStderr(this.#child.stderr, (data) => this.#emitData(data)).catch(
      (error: unknown) => this.#recordReadFailure(error),
    )
    void this.#child.exited.then((exitCode) => this.#handleBridgeExit(exitCode, output))
  }

  async #handleBridgeExit(exitCode: number, output: Promise<void>) {
    this.#bridgeExited = true
    await output
    if (this.#exitEmitted) return
    recordProcessWarning('terminal.bridge.ownership_unconfirmed', {
      area: 'terminal',
      cwd: this.#cwd,
      exitCode,
    })
    this.#emitData(
      '\r\nTerminal exit could not be confirmed. Checkout cleanup remains blocked.\r\n',
    )
  }

  #recordReadFailure(error: unknown) {
    recordProcessWarning('terminal.bridge.read_failed', {
      area: 'terminal',
      cwd: this.#cwd,
      error,
    })
  }

  #handleBridgeMessage(message: TerminalBridgeMessage) {
    if (message.type === 'output') {
      this.#emitData(message.data)
      return
    }
    if (message.type === 'exit') {
      this.#emitExit(message.exitCode)
      return
    }

    this.#emitData(`\r\n${message.message}\r\n`)
  }

  #sendCommand(command: Record<string, unknown>) {
    const chunk = this.#encoder.encode(`${JSON.stringify(command)}\n`)
    this.#writeQueue = this.#writeQueue
      .then(() => this.#stdin.write(chunk))
      .then(() => this.#stdin.flush())
      .then(noop, noop)
  }

  #emitData(data: string) {
    for (const listener of this.#dataListeners) {
      listener(data)
    }
  }

  #emitExit(exitCode: number | null) {
    if (this.#exitEmitted) return

    this.#exitEmitted = true
    const normalizedExitCode = exitCode ?? 0
    for (const listener of this.#exitListeners) {
      listener({ exitCode: normalizedExitCode })
    }
  }
}

function spawnTerminalBridge(options: TerminalPtySpawnOptions): TerminalBridgeProcess {
  return Bun.spawn([resolveNodeBinary(), '--eval', NODE_PTY_BRIDGE_SCRIPT], {
    env: {
      ...options.env,
      NODE_PTY_BRIDGE_MODULE: resolveNodePtyModule(),
    },
    stderr: 'pipe',
    stdin: 'pipe',
    stdout: 'pipe',
  })
}

async function readBridgeMessages(
  stream: ReadableStream<Uint8Array>,
  onMessage: (message: TerminalBridgeMessage) => void,
) {
  let buffered = ''
  const decoder = new TextDecoder()
  const reader = stream.getReader()

  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break

      buffered = readBridgeMessageChunk(
        buffered + decoder.decode(result.value, { stream: true }),
        onMessage,
      )
    }

    readBridgeMessageChunk(buffered + decoder.decode(), onMessage)
  } finally {
    reader.releaseLock()
  }
}

async function readBridgeStderr(
  stream: ReadableStream<Uint8Array>,
  onData: (data: string) => void,
) {
  const decoder = new TextDecoder()
  const reader = stream.getReader()

  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break

      onData(decoder.decode(result.value, { stream: true }))
    }

    const final = decoder.decode()
    if (final) onData(final)
  } finally {
    reader.releaseLock()
  }
}

function readBridgeMessageChunk(
  chunk: string,
  onMessage: (message: TerminalBridgeMessage) => void,
) {
  let buffered = chunk
  let newlineIndex = buffered.indexOf('\n')

  while (newlineIndex >= 0) {
    const raw = buffered.slice(0, newlineIndex)
    buffered = buffered.slice(newlineIndex + 1)
    const message = parseBridgeMessage(raw)
    if (message) onMessage(message)
    newlineIndex = buffered.indexOf('\n')
  }

  return buffered
}

function parseBridgeMessage(raw: string): TerminalBridgeMessage | null {
  if (!raw) return null

  try {
    return bridgeMessageFromValue(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

function bridgeMessageFromValue(value: unknown): TerminalBridgeMessage | null {
  if (!isRecord(value)) return null
  if (value.type === 'output' && typeof value.data === 'string') {
    return { type: 'output', data: value.data }
  }
  if (value.type === 'error' && typeof value.message === 'string') {
    return { type: 'error', message: value.message }
  }
  if (value.type !== 'exit') return null
  if (value.exitCode !== null && typeof value.exitCode !== 'number') return null

  return { type: 'exit', exitCode: value.exitCode }
}

function resolveNodePtyModule() {
  // `import.meta.dirname` resolves under both real Bun and Vitest's transform;
  // `import.meta.path` comes back undefined under Vitest and breaks resolveSync.
  return Bun.resolveSync('@lydell/node-pty', import.meta.dirname)
}

let cachedNodeBinary: string | undefined

// node-pty's native addon needs a real Node runtime: its master-fd socket breaks
// under Bun's Node emulation (`this._socket.write is not a function`). When the
// server runs under `bun --bun` (notably the Vitest suite), Bun prepends a shim
// directory to PATH whose `node` symlinks to the Bun binary, so a bare `node`
// spawn would run Bun. Resolve the first PATH entry whose `node` is not that shim.
function resolveNodeBinary(): string {
  if (cachedNodeBinary) return cachedNodeBinary

  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!dir) continue
    const candidate = path.join(dir, 'node')
    let real: string
    try {
      real = realpathSync(candidate)
    } catch {
      continue
    }
    if (path.basename(real).startsWith('bun')) continue
    cachedNodeBinary = candidate
    return candidate
  }

  cachedNodeBinary = 'node'
  return cachedNodeBinary
}

function noop() {}

const NODE_PTY_BRIDGE_SCRIPT = String.raw`
const modulePath = process.env.NODE_PTY_BRIDGE_MODULE;
if (!modulePath) {
  send({ type: "error", message: "missing node-pty module path" });
  process.exit(1);
}

const pty = require(modulePath);
let ptyProcess = null;
let buffered = "";

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffered += chunk;
  let newlineIndex = buffered.indexOf("\n");

  while (newlineIndex >= 0) {
    const raw = buffered.slice(0, newlineIndex);
    buffered = buffered.slice(newlineIndex + 1);
    handleRawCommand(raw);
    newlineIndex = buffered.indexOf("\n");
  }
});
process.stdin.on("end", shutdown);
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function handleRawCommand(raw) {
  if (!raw) return;

  try {
    handleCommand(JSON.parse(raw));
  } catch (error) {
    send({ type: "error", message: errorMessage(error) });
  }
}

function handleCommand(command) {
  if (!command || typeof command !== "object") return;
  if (command.type === "start") {
    start(command);
    return;
  }
  if (!ptyProcess) return;
  if (command.type === "input" && typeof command.data === "string") {
    ptyProcess.write(command.data);
    return;
  }
  if (
    command.type === "resize" &&
    Number.isFinite(command.cols) &&
    Number.isFinite(command.rows)
  ) {
    ptyProcess.resize(command.cols, command.rows);
    return;
  }
  if (command.type === "kill") {
    shutdown();
  }
}

function start(command) {
  ptyProcess = pty.spawn(command.shell, [], {
    cols: command.cols,
    cwd: command.cwd,
    env: command.env,
    name: "xterm-256color",
    rows: command.rows,
  });
  ptyProcess.onData((data) => send({ type: "output", data }));
  ptyProcess.onExit((event) => {
    send({
      type: "exit",
      exitCode: Number.isFinite(event.exitCode) ? event.exitCode : null,
    });
    process.exit(0);
  });
}

function shutdown() {
  if (!ptyProcess) {
    process.exit(0);
    return;
  }

  try {
    ptyProcess.kill();
  } catch (error) {
    send({ type: "error", message: "PTY termination failed: " + errorMessage(error) });
  }
}

function send(message) {
  process.stdout.write(JSON.stringify(message) + "\n");
}

function errorMessage(error) {
  return error instanceof Error ? error.message : "terminal bridge failed";
}
`
