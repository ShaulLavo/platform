import { TypeScriptLspSession } from "./session"
import type { FileSystemService } from "../../fs/service"

export function typeScriptLspRoutes(fs: FileSystemService) {
  const sessions = new WeakMap<object, TypeScriptLspSession>()

  return {
    open(ws: unknown) {
      const socket = websocketObject(ws)
      if (!socket) return

      const root = fs.paths.resolve(socket.root)
      const session = new TypeScriptLspSession({
        root: root.absolutePath,
        workspaceRoot: fs.paths.workspaceRoot,
        send: (message) => socket.send(message),
      })
      sessions.set(socket.key, session)
    },
    message(ws: unknown, message: unknown) {
      const socket = websocketObject(ws)
      if (!socket) return

      const session = sessions.get(socket.key)
      if (!session) return
      const encoded = lspMessage(message)
      if (encoded === null) return

      session.handleMessage(encoded)
    },
    close(ws: unknown) {
      const socket = websocketObject(ws)
      if (!socket) return

      sessions.get(socket.key)?.dispose()
      sessions.delete(socket.key)
    },
  }
}

type LspWebSocket = {
  key: object
  root: string
  send(message: string): unknown
}

function websocketObject(value: unknown): LspWebSocket | null {
  if (!isRecord(value)) return null
  if (typeof value.send !== "function") return null

  const send = value.send
  return {
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
  if (isRecord(data.query) && typeof data.query.root === "string") return data.query.root
  if (typeof data.url !== "string") return ""

  try {
    return new URL(data.url).searchParams.get("root") ?? ""
  } catch {
    return ""
  }
}

function lspMessage(value: unknown): string | ArrayBuffer | Uint8Array | null {
  if (typeof value === "string") return value
  if (value instanceof ArrayBuffer) return value
  if (value instanceof Uint8Array) return value
  if (isRecord(value)) return JSON.stringify(value)
  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
