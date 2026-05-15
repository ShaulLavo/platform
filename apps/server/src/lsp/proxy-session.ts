import { isRecord } from "@workspace/contracts"
import type { ChildProcessWithoutNullStreams } from "node:child_process"

import type { LspServerMatch } from "./registry"
import { LspStdioMessageReader, writeLspStdioMessage } from "./stdio-rpc"

type JsonRpcId = number | string | null

type JsonRpcRequest = {
  readonly id: JsonRpcId
  readonly jsonrpc?: string
  readonly method: string
  params?: unknown
}

type LspProxySocket = {
  close(): unknown
  send(message: string): unknown
}

export class LspProxySession {
  private readonly match: LspServerMatch
  private readonly process: ChildProcessWithoutNullStreams
  private readonly reader: LspStdioMessageReader
  private readonly socket: LspProxySocket
  private disposed = false

  private constructor(
    socket: LspProxySocket,
    match: LspServerMatch,
    process: ChildProcessWithoutNullStreams
  ) {
    this.match = match
    this.process = process
    this.socket = socket
    this.reader = new LspStdioMessageReader((message) => this.handleServerMessage(message))
    this.bindProcess()
  }

  static async create(socket: LspProxySocket, match: LspServerMatch) {
    const handle = await match.server.spawn(match.root)
    if (!handle) return null

    return new LspProxySession(socket, match, handle.process)
  }

  async handleClientMessage(message: string | ArrayBuffer | Uint8Array) {
    if (this.disposed) return

    const encoded = normalizeClientMessage(message)
    if (!encoded) return

    writeLspStdioMessage(this.process.stdin, await this.prepareClientMessage(encoded))
  }

  dispose() {
    if (this.disposed) return

    this.disposed = true
    this.process.kill()
  }

  private bindProcess() {
    this.process.stdout.on("data", (chunk) => this.reader.push(chunk))
    this.process.stderr.on("data", (chunk) => this.logStderr(chunk))
    this.process.once("exit", () => this.closeSocket())
    this.process.once("error", () => this.closeSocket())
  }

  private handleServerMessage(message: string) {
    const parsed = parseJsonMessage(message)
    if (isServerRequest(parsed) && this.handleServerRequest(parsed)) return

    this.socket.send(message)
  }

  private async prepareClientMessage(message: string) {
    const parsed = parseJsonMessage(message)
    if (!isServerRequest(parsed)) return message
    if (parsed.method !== "initialize") return message

    return JSON.stringify(await this.initializeRequest(parsed))
  }

  private async initializeRequest(message: JsonRpcRequest) {
    const params = isRecord(message.params) ? { ...message.params } : {}
    params.rootUri = fileUriForPath(this.match.root)
    params.workspaceFolders = [
      {
        name: this.match.server.id,
        uri: fileUriForPath(this.match.root),
      },
    ]
    params.processId = this.process.pid ?? null
    message.params = params

    await this.applyInitializationOptions(params)
    return message
  }

  private async applyInitializationOptions(params: Record<string, unknown>) {
    const options = await this.match.server.initializationOptions?.(this.match.root)
    if (!options) return

    params.initializationOptions = {
      ...(isRecord(params.initializationOptions) ? params.initializationOptions : {}),
      ...options,
    }
  }

  private handleServerRequest(message: JsonRpcRequest) {
    if (message.method === "workspace/configuration") {
      this.respond(message.id, [{}])
      return true
    }
    if (message.method === "workspace/workspaceFolders") {
      this.respond(message.id, [
        {
          name: this.match.server.id,
          uri: fileUriForPath(this.match.root),
        },
      ])
      return true
    }
    if (message.method === "window/workDoneProgress/create") {
      this.respond(message.id, null)
      return true
    }
    if (message.method === "client/registerCapability") {
      this.respond(message.id, null)
      return true
    }
    if (message.method === "client/unregisterCapability") {
      this.respond(message.id, null)
      return true
    }

    return false
  }

  private respond(id: JsonRpcId, result: unknown) {
    writeLspStdioMessage(
      this.process.stdin,
      JSON.stringify({
        id,
        jsonrpc: "2.0",
        result,
      })
    )
  }

  private closeSocket() {
    if (this.disposed) return

    this.disposed = true
    this.socket.close()
  }

  private logStderr(chunk: Buffer | Uint8Array | string) {
    const text = Buffer.from(chunk).toString("utf8").trim()
    if (!text) return

    console.warn(`[lsp:${this.match.server.id}] ${text}`)
  }
}

function normalizeClientMessage(message: string | ArrayBuffer | Uint8Array) {
  if (typeof message === "string") return message
  if (message instanceof ArrayBuffer) return Buffer.from(message).toString("utf8")
  if (message instanceof Uint8Array) return Buffer.from(message).toString("utf8")

  return null
}

function parseJsonMessage(message: string) {
  try {
    return JSON.parse(message) as unknown
  } catch {
    return null
  }
}

function isServerRequest(value: unknown): value is JsonRpcRequest {
  if (!isRecord(value)) return false
  if (typeof value.method !== "string") return false
  if (!("id" in value)) return false

  return typeof value.id === "number" || typeof value.id === "string" || value.id === null
}

function fileUriForPath(filePath: string) {
  const normalized = filePath.replace(/^\/+/, "")
  return `file:///${normalized.split("/").map(encodeURIComponent).join("/")}`
}
