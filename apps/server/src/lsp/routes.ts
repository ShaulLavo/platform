import { isRecord } from '@workspace/contracts'
import * as v from 'valibot'

import { authenticateWebSocketData, type AuthConfig } from '../auth'
import { pathSchema } from '../fs/contracts'
import type { WorkspacePaths } from '../fs/path'
import { matchLspServer } from './registry'
import { LspProxySession } from './proxy-session'

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

export function lspRoutes(fs: LspRouteFileSystem, auth: AuthConfig) {
  const sessions = new WeakMap<object, LspProxySession>()

  return {
    async open(ws: unknown) {
      const socket = websocketObject(ws)
      if (!socket) return
      if (authenticateWebSocketData(socket.data, auth)) {
        socket.close()
        return
      }

      const match = await resolveLspRouteMatch(fs.paths, socket)
      if (!match) {
        socket.close()
        return
      }

      const session = await LspProxySession.create(socket, match)
      if (!session) {
        socket.close()
        return
      }

      sessions.set(socket.key, session)
    },
    message(ws: unknown, message: unknown) {
      const socket = websocketObject(ws)
      if (!socket) return

      const session = sessions.get(socket.key)
      if (!session) return
      const encoded = lspMessage(message)
      if (!encoded) return

      session.handleClientMessage(encoded)
    },
    close(ws: unknown) {
      const socket = websocketObject(ws)
      if (!socket) return

      sessions.get(socket.key)?.dispose()
      sessions.delete(socket.key)
    },
  }
}

async function resolveLspRouteMatch(paths: WorkspacePaths, input: LspRouteMatchInput) {
  try {
    const file = input.path ? paths.resolve(input.path) : null
    if (!file) return null

    return matchLspServer({
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
