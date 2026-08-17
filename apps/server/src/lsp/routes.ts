import { isRecord } from '@workspace/contracts'
import * as v from 'valibot'

import { authenticateWebSocketData, type AuthConfig } from '../auth'
import { pathSchema } from '../fs/contracts'
import type { WorkspacePaths } from '../fs/path'
import { matchLspServer } from './registry'
import type { LspProxyClientSession, LspSessionSource } from './proxy-session'
import { recordProcessWarning } from '../observability'

type LspRouteFileSystem = {
  readonly paths: WorkspacePaths
}

export const lspMatchQuerySchema = v.object({
  path: pathSchema,
  root: v.optional(pathSchema, ''),
  server: v.optional(v.string()),
})

export async function lspRouteMatch(
  paths: WorkspacePaths,
  query: v.InferOutput<typeof lspMatchQuerySchema>,
) {
  const match = await resolveLspRouteMatch(paths, {
    path: query.path,
    root: query.root,
    serverId: query.server ?? null,
  })
  if (!match) return null

  return {
    root: match.root,
    serverId: match.server.id,
  }
}

export type LspRouteDeps = {
  readonly matchServer?: typeof matchLspServer
  /**
   * Required: the app owns the pool so `appCleanup` can tear it down. There is
   * deliberately no module-global fallback — that was the bug.
   */
  readonly pool: LspSessionSource
}

export function lspRoutes(fs: LspRouteFileSystem, auth: AuthConfig, deps: LspRouteDeps) {
  const sessions = new WeakMap<object, PendingLspSession>()
  const matchServer = deps.matchServer ?? matchLspServer

  return {
    async open(ws: unknown) {
      const socket = websocketObject(ws)
      if (!socket) return

      const pending = createPendingLspSession()
      sessions.set(socket.key, pending)

      const authError = authenticateWebSocketData(socket.data, auth)
      if (authError) {
        rejectPendingLspSession(sessions, socket, pending)
        recordProcessWarning('lsp.session.rejected', {
          area: 'lsp',
          errorCode: authError.code,
          operation: 'open',
          outcome: 'auth_failed',
          status: authError.statusCode,
        })
        socket.close()
        return
      }

      const match = await resolveLspRouteMatch(fs.paths, socket, matchServer)
      if (!match) {
        rejectPendingLspSession(sessions, socket, pending)
        recordProcessWarning('lsp.session.rejected', {
          area: 'lsp',
          operation: 'open',
          outcome: 'no_server_match',
          path: socket.path,
          serverId: socket.serverId,
        })
        socket.close()
        return
      }

      const session = await deps.pool.acquire(socket, match, fs.paths.toRelative(match.root))
      if (!session) {
        rejectPendingLspSession(sessions, socket, pending)
        recordProcessWarning('lsp.session.rejected', {
          area: 'lsp',
          operation: 'open',
          outcome: 'spawn_failed',
          rootPath: fs.paths.toRelative(match.root),
          serverId: match.server.id,
        })
        socket.close()
        return
      }

      attachPendingLspSession(pending, session)
    },
    message(ws: unknown, message: unknown) {
      const socket = websocketObject(ws)
      if (!socket) return

      const session = sessions.get(socket.key)
      if (!session) return
      const encoded = lspMessage(message)
      if (!encoded) return

      queueLspClientMessage(session, encoded)
    },
    close(ws: unknown) {
      const socket = websocketObject(ws)
      if (!socket) return

      sessions.get(socket.key)?.dispose()
      sessions.delete(socket.key)
    },
  }
}

type LspClientMessage = string | ArrayBuffer | Uint8Array

type PendingLspSession = {
  readonly messages: LspClientMessage[]
  closed: boolean
  flushing: boolean
  session: LspProxyClientSession | null
  dispose(): void
}

function createPendingLspSession(): PendingLspSession {
  const pending: PendingLspSession = {
    messages: [],
    closed: false,
    flushing: false,
    session: null,
    dispose: () => {
      pending.closed = true
      pending.messages.length = 0
      pending.session?.dispose()
      pending.session = null
    },
  }

  return pending
}

function rejectPendingLspSession(
  sessions: WeakMap<object, PendingLspSession>,
  socket: LspWebSocket,
  pending: PendingLspSession,
) {
  pending.dispose()
  sessions.delete(socket.key)
}

function attachPendingLspSession(pending: PendingLspSession, session: LspProxyClientSession) {
  if (pending.closed) {
    session.dispose()
    return
  }

  pending.session = session
  flushPendingLspSession(pending)
}

function queueLspClientMessage(pending: PendingLspSession, message: LspClientMessage) {
  if (pending.closed) return

  pending.messages.push(message)
  flushPendingLspSession(pending)
}

function flushPendingLspSession(pending: PendingLspSession) {
  if (pending.flushing) return
  if (pending.closed) return
  if (!pending.session) return

  pending.flushing = true
  void flushPendingLspMessages(pending)
}

async function flushPendingLspMessages(pending: PendingLspSession) {
  while (!pending.closed && pending.session && pending.messages.length > 0) {
    const message = pending.messages.shift()
    if (message) await pending.session.handleClientMessage(message)
  }

  pending.flushing = false
  if (pending.messages.length > 0) flushPendingLspSession(pending)
}

async function resolveLspRouteMatch(
  paths: WorkspacePaths,
  input: LspRouteMatchInput,
  match: typeof matchLspServer = matchLspServer,
) {
  try {
    const file = input.path ? paths.resolve(input.path) : null
    if (!file) return null

    return match({
      filePath: file.absolutePath,
      serverId: input.serverId,
      workspaceRoot: paths.resolve(input.root).absolutePath,
    })
  } catch {
    return null
  }
}

type LspRouteMatchInput = {
  readonly path: string
  readonly root: string
  readonly serverId: string | null
}

type LspWebSocket = {
  close(): unknown
  data: unknown
  key: object
  path: string
  root: string
  send(message: string): unknown
  serverId: string | null
}

function websocketObject(value: unknown): LspWebSocket | null {
  if (!isRecord(value)) return null
  if (typeof value.send !== 'function') return null

  const close = value.close
  const send = value.send
  return {
    close: () => (typeof close === 'function' ? close.call(value) : undefined),
    data: value.data,
    key: websocketKey(value),
    path: queryValue(value.data, 'path') ?? '',
    root: queryValue(value.data, 'root') ?? '',
    send: (message) => send.call(value, message),
    serverId: queryValue(value.data, 'server'),
  }
}

function websocketKey(value: Record<string, unknown>): object {
  return isRecord(value.raw) ? value.raw : value
}

function queryValue(data: unknown, key: string) {
  if (!isRecord(data)) return null
  if (isRecord(data.query)) {
    const value = data.query[key]
    if (typeof value === 'string') return value
  }
  if (typeof data.url !== 'string') return null

  try {
    return new URL(data.url).searchParams.get(key)
  } catch {
    return null
  }
}

function lspMessage(value: unknown): string | ArrayBuffer | Uint8Array | null {
  if (typeof value === 'string') return value
  if (value instanceof ArrayBuffer) return value
  if (value instanceof Uint8Array) return value
  if (isRecord(value)) return JSON.stringify(value)

  return null
}
