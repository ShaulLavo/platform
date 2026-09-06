import type { TerminalExecutionLease, TerminalLeaseBoundary } from './lease'
import * as v from 'valibot'
import {
  terminalOpenInputSchema,
  type TerminalOpenInput,
  type WorktreeId,
} from '@workspace/contracts'
import { realpathSync } from 'node:fs'
import { spawnPty, type Pty } from '@workspace/pty'
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

export type TerminalPtyFactory = typeof spawnPty

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
  send: (message: string | Uint8Array) => void
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
    ptyFactory = spawnPty,
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
  private readonly outputBufferChunks: Uint8Array[] = []
  private connection: TerminalConnection | null = null
  private completion = Promise.resolve()
  private detachTimer: ReturnType<typeof setTimeout> | null = null
  private disposed = false
  private errorMessage: string | null = null
  private exitCode: number | null = null
  private exitSignal: NodeJS.Signals | null = null
  private inputBytes = 0
  private inputMessageCount = 0
  private openedAt = performance.now()
  private outputBufferBytes = 0
  private outputBytes = 0
  private outputMessageCount = 0
  private pty: Pty | null = null
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
    this.completion = this.pty.exited.then(
      ({ exitCode, signal }) => {
        this.exitCode = exitCode
        this.exitSignal = signal
        this.emit({ type: 'exit', exitCode })
        return this.dispose({ kill: false })
      },
      (error: unknown) => this.handlePtyFailure(error),
    )
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
    for (const data of this.outputBufferChunks) this.emit({ type: 'output', data })
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

    try {
      handleTerminalClientMessage(this.pty, parsed)
    } catch (error) {
      recordProcessWarning('terminal.session.input_failed', {
        area: 'terminal',
        worktreeId: this.worktreeId,
        sessionId: this.sessionId,
        operation: parsed.type,
        error,
      })
      this.emit({ type: 'error', message: terminalSpawnErrorMessage(error) })
    }
  }

  dispose(options: { kill?: boolean } = {}): Promise<void> {
    if (this.disposed) return this.disposal
    this.cancelDetachTimer()
    if ((options.kill ?? true) && this.pty && this.exitCode === null)
      return this.requestTermination()

    this.disposed = true
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
        return this.completion
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

  private handlePtyFailure(error: unknown) {
    this.terminating = true
    this.cancelDetachTimer()
    recordProcessWarning('terminal.session.ownership_unconfirmed', {
      area: 'terminal',
      worktreeId: this.worktreeId,
      sessionId: this.sessionId,
      pid: this.pty?.pid,
      error,
    })
    this.emit({ type: 'error', message: 'Terminal cleanup could not be confirmed.' })
    this.connection?.close()
    this.connection = null
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

  private handleOutput(data: Uint8Array) {
    this.appendOutput(data)
    this.emit({ type: 'output', data })
  }

  private appendOutput(data: Uint8Array) {
    if (data.byteLength === 0) return
    if (data.byteLength >= TERMINAL_REPLAY_BUFFER_BYTES) {
      this.outputBufferChunks.length = 0
      // Copy at the retention boundary so an oversized chunk cannot pin its whole allocation.
      this.outputBufferChunks.push(new Uint8Array(data.subarray(-TERMINAL_REPLAY_BUFFER_BYTES)))
      this.outputBufferBytes = TERMINAL_REPLAY_BUFFER_BYTES
      return
    }
    this.outputBufferChunks.push(data)
    this.outputBufferBytes += data.byteLength
    while (this.outputBufferBytes > TERMINAL_REPLAY_BUFFER_BYTES) {
      const first = this.outputBufferChunks[0]
      const removed = Math.min(
        first.byteLength,
        this.outputBufferBytes - TERMINAL_REPLAY_BUFFER_BYTES,
      )
      this.outputBufferBytes -= removed
      if (removed === first.byteLength) {
        this.outputBufferChunks.shift()
        continue
      }
      this.outputBufferChunks[0] = first.subarray(removed)
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
          command: [shell],
          onData: (data) => this.handleOutput(data),
        }),
        shell,
      }
    } catch (error) {
      return { error, pty: null, shell }
    }
  }

  private emit(message: TerminalServerMessage) {
    this.recordServerMessage(message)
    const connection = this.connection
    if (!connection) return
    try {
      // Elysia passes Buffer through; a plain Uint8Array would become JSON.
      const frame =
        message.type === 'output'
          ? Buffer.from(message.data.buffer, message.data.byteOffset, message.data.byteLength)
          : JSON.stringify(message)
      connection.send(frame)
    } catch (error) {
      recordProcessWarning('terminal.session.send_failed', {
        area: 'terminal',
        worktreeId: this.worktreeId,
        sessionId: this.sessionId,
        error,
      })
      this.detach(connection.key)
    }
  }

  private recordClientMessage(message: TerminalClientMessage) {
    if (message.type === 'dispose') return
    if (message.type === 'input') {
      this.inputBytes += message.data.byteLength
      this.inputMessageCount += 1
      return
    }

    this.resizeCount += 1
  }

  private recordServerMessage(message: TerminalServerMessage) {
    this.serverMessageCount += 1
    if (message.type === 'output') {
      this.outputBytes += message.data.byteLength
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
      signal: this.exitSignal,
      pid: this.pty?.pid,
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
  send(message: string | Uint8Array): unknown
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

function handleTerminalClientMessage(ptyProcess: Pty, message: TerminalClientMessage) {
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
