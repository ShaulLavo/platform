import { isRecord } from '@workspace/contracts'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'

import type { LspServerMatch } from './registry'
import { LspStdioMessageReader, writeLspStdioMessage } from './stdio-rpc'
import { elapsedMs, limitText, recordProcessInfo, recordProcessWarning } from '../observability'

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
  private readonly rootPath: string
  private readonly socket: LspProxySocket
  private clientBytes = 0
  private clientMessageCount = 0
  private disposed = false
  private exitCode: number | null = null
  private exitSignal: NodeJS.Signals | null = null
  private openedAt = performance.now()
  private serverBytes = 0
  private serverHandledRequestCount = 0
  private serverMessageCount = 0
  private stderrBytes = 0
  private stderrCount = 0
  private stderrTail = ''

  private constructor(
    socket: LspProxySocket,
    match: LspServerMatch,
    process: ChildProcessWithoutNullStreams,
    rootPath: string,
  ) {
    this.match = match
    this.process = process
    this.rootPath = rootPath
    this.socket = socket
    this.reader = new LspStdioMessageReader((message) => this.handleServerMessage(message))
    this.bindProcess()
  }

  static async create(socket: LspProxySocket, match: LspServerMatch, rootPath: string) {
    const handle = await match.server.spawn(match.root)
    if (!handle) return null

    return new LspProxySession(socket, match, handle.process, rootPath)
  }

  async handleClientMessage(message: string | ArrayBuffer | Uint8Array) {
    if (this.disposed) return

    const encoded = normalizeClientMessage(message)
    if (!encoded) return

    this.clientBytes += byteLength(encoded)
    this.clientMessageCount += 1
    writeLspStdioMessage(this.process.stdin, await this.prepareClientMessage(encoded))
  }

  dispose() {
    if (this.disposed) return

    this.disposed = true
    this.process.kill()
    this.recordSession('disposed')
  }

  private bindProcess() {
    this.process.stdout.on('data', (chunk) => this.reader.push(chunk))
    this.process.stderr.on('data', (chunk) => this.logStderr(chunk))
    this.process.once('exit', (code, signal) => {
      this.exitCode = code
      this.exitSignal = signal
      this.closeSocket('process_exit')
    })
    this.process.once('error', () => this.closeSocket('process_error'))
  }

  private handleServerMessage(message: string) {
    this.serverBytes += Buffer.byteLength(message, 'utf8')
    this.serverMessageCount += 1
    const parsed = parseJsonMessage(message)
    if (isServerRequest(parsed) && this.handleServerRequest(parsed)) {
      this.serverHandledRequestCount += 1
      return
    }

    this.socket.send(message)
  }

  private async prepareClientMessage(message: string) {
    const parsed = parseJsonMessage(message)
    if (!isServerRequest(parsed)) return message
    if (parsed.method !== 'initialize') return message

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
    if (message.method === 'workspace/configuration') {
      this.respond(message.id, [{}])
      return true
    }
    if (message.method === 'workspace/workspaceFolders') {
      this.respond(message.id, [
        {
          name: this.match.server.id,
          uri: fileUriForPath(this.match.root),
        },
      ])
      return true
    }
    if (message.method === 'window/workDoneProgress/create') {
      this.respond(message.id, null)
      return true
    }
    if (message.method === 'client/registerCapability') {
      this.respond(message.id, null)
      return true
    }
    if (message.method === 'client/unregisterCapability') {
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
        jsonrpc: '2.0',
        result,
      }),
    )
  }

  private closeSocket(outcome: string) {
    if (this.disposed) return

    this.disposed = true
    this.recordSession(outcome)
    this.socket.close()
  }

  private logStderr(chunk: Buffer | Uint8Array | string) {
    const text = Buffer.from(chunk).toString('utf8').trim()
    if (!text) return

    this.stderrBytes += Buffer.byteLength(text, 'utf8')
    this.stderrCount += 1
    this.stderrTail = limitText(`${this.stderrTail}\n${text}`.trim(), 1_000)
  }

  private recordSession(outcome: string) {
    const context = {
      area: 'lsp',
      clientBytes: this.clientBytes,
      clientMessageCount: this.clientMessageCount,
      durationMs: elapsedMs(this.openedAt),
      exitCode: this.exitCode,
      exitSignal: this.exitSignal,
      operation: 'session',
      outcome,
      rootPath: this.rootPath,
      serverBytes: this.serverBytes,
      serverHandledRequestCount: this.serverHandledRequestCount,
      serverId: this.match.server.id,
      serverMessageCount: this.serverMessageCount,
      stderrBytes: this.stderrBytes,
      stderrCount: this.stderrCount,
      stderrTail: this.stderrTail || undefined,
    }

    if (isFailedLspSession(outcome, this.exitCode, this.exitSignal)) {
      recordProcessWarning('lsp.session', context)
      return
    }

    recordProcessInfo('lsp.session', context)
  }
}

function normalizeClientMessage(message: string | ArrayBuffer | Uint8Array) {
  if (typeof message === 'string') return message
  if (message instanceof ArrayBuffer) return Buffer.from(message).toString('utf8')
  if (message instanceof Uint8Array) return Buffer.from(message).toString('utf8')

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
  if (typeof value.method !== 'string') return false
  if (!('id' in value)) return false

  return typeof value.id === 'number' || typeof value.id === 'string' || value.id === null
}

function fileUriForPath(filePath: string) {
  const normalized = filePath.replace(/^\/+/, '')
  return `file:///${normalized.split('/').map(encodeURIComponent).join('/')}`
}

function byteLength(value: string | ArrayBuffer | Uint8Array) {
  if (typeof value === 'string') return Buffer.byteLength(value, 'utf8')
  if (value instanceof ArrayBuffer) return value.byteLength

  return value.byteLength
}

function isFailedLspSession(
  outcome: string,
  exitCode: number | null,
  exitSignal: NodeJS.Signals | null,
) {
  if (outcome === 'process_error') return true
  if (outcome !== 'process_exit') return false
  if (exitSignal) return true

  return exitCode !== 0
}
