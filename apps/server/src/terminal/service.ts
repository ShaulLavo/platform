import * as pty from "@lydell/node-pty"
import {
  isRecord,
  parseTerminalClientMessage,
  type TerminalClientMessage,
  type TerminalServerMessage,
} from "@workspace/contracts"

import { authenticateWebSocketData, type AuthConfig } from "../auth"
import { FsError, isFsError } from "../fs/errors"
import type { WorkspacePaths } from "../fs/path"

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

export type TerminalPtySpawnOptions = {
  cols: number
  cwd: string
  env: NodeJS.ProcessEnv
  rows: number
  shell: string
}

export type TerminalPtyFactory = (
  options: TerminalPtySpawnOptions
) => TerminalPty

export type TerminalServiceOptions = {
  env?: NodeJS.ProcessEnv
  paths: WorkspacePaths
  ptyFactory?: TerminalPtyFactory
}

const DEFAULT_COLS = 80
const DEFAULT_ROWS = 24

export class TerminalService {
  private readonly env: NodeJS.ProcessEnv
  private readonly paths: WorkspacePaths
  private readonly ptyFactory: TerminalPtyFactory
  private readonly sessions = new Set<TerminalSession>()

  constructor({
    env = process.env,
    paths,
    ptyFactory = defaultTerminalPtyFactory,
  }: TerminalServiceOptions) {
    this.env = env
    this.paths = paths
    this.ptyFactory = ptyFactory
  }

  routes(auth: AuthConfig) {
    return {
      open: (ws: unknown) => this.open(ws, auth),
      message: (ws: unknown, message: unknown) => this.message(ws, message),
      close: (ws: unknown) => this.close(ws),
    }
  }

  dispose() {
    for (const session of this.sessions) {
      session.dispose()
    }
    this.sessions.clear()
  }

  private open(ws: unknown, auth: AuthConfig) {
    const socket = terminalWebSocketObject(ws)
    if (!socket) return
    const authError = authenticateWebSocketData(socket.data, auth)
    if (authError) {
      socket.close()
      return
    }

    const root = this.resolveRoot(socket.root)
    if (!root) {
      socket.close()
      return
    }

    const session = new TerminalSession({
      cwd: root.absolutePath,
      env: this.env,
      onDispose: (disposed) => this.sessions.delete(disposed),
      ptyFactory: this.ptyFactory,
      send: socket.send,
    })
    this.sessions.add(session)
    socketSessions.set(socket.key, session)
    if (session.start()) return

    session.dispose({ kill: false })
    socketSessions.delete(socket.key)
    socket.close()
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

    const session = socketSessions.get(socket.key)
    session?.dispose()
    socketSessions.delete(socket.key)
  }

  private resolveRoot(root: string) {
    try {
      return this.paths.resolve(root)
    } catch (error) {
      if (isFsError(error)) return null

      throw error
    }
  }
}

export class TerminalSession {
  private readonly cwd: string
  private readonly env: NodeJS.ProcessEnv
  private readonly onDispose: (session: TerminalSession) => void
  private readonly ptyFactory: TerminalPtyFactory
  private readonly send: (message: string) => void
  private dataDisposable: TerminalPtyDisposable | null = null
  private disposed = false
  private exitDisposable: TerminalPtyDisposable | null = null
  private pty: TerminalPty | null = null

  constructor({
    cwd,
    env,
    onDispose,
    ptyFactory,
    send,
  }: {
    cwd: string
    env: NodeJS.ProcessEnv
    onDispose: (session: TerminalSession) => void
    ptyFactory: TerminalPtyFactory
    send: (message: string) => void
  }) {
    this.cwd = cwd
    this.env = env
    this.onDispose = onDispose
    this.ptyFactory = ptyFactory
    this.send = send
  }

  start() {
    const spawnResult = this.spawnPty()
    if (!spawnResult) return false

    this.pty = spawnResult.pty
    this.dataDisposable = this.pty.onData((data) =>
      this.sendMessage({ type: "output", data })
    )
    this.exitDisposable = this.pty.onExit((event) => {
      this.sendMessage({ type: "exit", exitCode: event.exitCode })
      this.dispose({ kill: false })
    })
    this.sendMessage({
      type: "ready",
      cwd: this.cwd,
      shell: spawnResult.shell,
    })
    return true
  }

  handleMessage(message: unknown) {
    if (this.disposed) return

    const parsed = parseTerminalClientMessage(message)
    if (!parsed) return
    if (!this.pty) return

    handleTerminalClientMessage(this.pty, parsed)
  }

  dispose(options: { kill?: boolean } = {}) {
    if (this.disposed) return

    this.disposed = true
    this.dataDisposable?.dispose()
    this.exitDisposable?.dispose()
    this.killPty(options.kill ?? true)
    this.onDispose(this)
  }

  private spawnPty() {
    const candidates = terminalShellCandidates(this.env)
    let lastError: unknown = null

    for (const shell of candidates) {
      const result = this.trySpawnPty(shell)
      if (result.pty) return result

      lastError = result.error
    }

    this.sendMessage({
      message: terminalSpawnErrorMessage(lastError),
      type: "error",
    })
    return null
  }

  private trySpawnPty(shell: string) {
    try {
      return {
        pty: this.ptyFactory({
          cols: DEFAULT_COLS,
          cwd: this.cwd,
          env: terminalEnv(this.env),
          rows: DEFAULT_ROWS,
          shell,
        }),
        shell,
      }
    } catch (error) {
      return { error, pty: null, shell }
    }
  }

  private killPty(kill: boolean) {
    if (!kill) return
    if (!this.pty) return

    try {
      this.pty.kill()
    } catch {
      // The PTY may already be gone; cleanup should still be idempotent.
    }
  }

  private sendMessage(message: TerminalServerMessage) {
    this.send(JSON.stringify(message))
  }
}

const socketSessions = new WeakMap<object, TerminalSession>()

type TerminalWebSocket = {
  close(): unknown
  data: unknown
  key: object
  root: string
  send(message: string): unknown
}

function terminalWebSocketObject(value: unknown): TerminalWebSocket | null {
  if (!isRecord(value)) return null
  if (typeof value.send !== "function") return null

  const close = value.close
  const send = value.send
  return {
    close: () => (typeof close === "function" ? close.call(value) : undefined),
    data: value.data,
    key: websocketKey(value),
    root: rootFromWebSocketData(value.data),
    send: (message) => send.call(value, message),
  }
}

function websocketKey(value: Record<string, unknown>): object {
  return isRecord(value.raw) ? value.raw : value
}

function rootFromWebSocketData(data: unknown) {
  if (!isRecord(data)) return ""
  if (isRecord(data.query) && typeof data.query.root === "string") {
    return data.query.root
  }
  if (typeof data.url !== "string") return ""

  try {
    return new URL(data.url).searchParams.get("root") ?? ""
  } catch {
    return ""
  }
}

function handleTerminalClientMessage(
  ptyProcess: TerminalPty,
  message: TerminalClientMessage
) {
  if (message.type === "input") {
    ptyProcess.write(message.data)
    return
  }

  ptyProcess.resize(message.cols, message.rows)
}

function terminalShellCandidates(env: NodeJS.ProcessEnv) {
  if (process.platform === "win32") {
    return uniqueShells([env.SHELL, env.COMSPEC, "powershell.exe", "cmd.exe"])
  }

  return uniqueShells([env.SHELL, "bash", "sh"])
}

function uniqueShells(shells: Array<string | undefined>) {
  return [...new Set(shells.map((shell) => shell?.trim()).filter(isString))]
}

function terminalEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...env,
    COLORTERM: env.COLORTERM ?? "truecolor",
    TERM: "xterm-256color",
  }
}

function defaultTerminalPtyFactory({
  cols,
  cwd,
  env,
  rows,
  shell,
}: TerminalPtySpawnOptions): TerminalPty {
  return pty.spawn(shell, [], {
    cols,
    cwd,
    env,
    name: "xterm-256color",
    rows,
  })
}

function terminalSpawnErrorMessage(error: unknown) {
  if (error instanceof FsError) return error.message
  if (error instanceof Error) return error.message

  return "failed to start terminal"
}

function isString(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0
}
