import { createInternalError } from '../observability/structured-errors'

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

type JsonRpcNotification = {
  readonly jsonrpc?: string
  readonly method: string
  params?: unknown
}

type JsonRpcResponse = {
  readonly id: JsonRpcId
  readonly jsonrpc?: string
  readonly result?: unknown
  readonly error?: unknown
}

type PendingBackendRequest = {
  readonly clientId: JsonRpcId
  readonly connection: LspProxyConnection | null
  readonly method: string
  reject?: (error: unknown) => void
  resolve?: (response: JsonRpcResponse) => void
}

type SharedDocument = {
  backendVersion: number
  languageId: string
  readonly owners: Set<LspProxyConnection>
  text: string
}

type DidOpenDocument = {
  readonly languageId: string
  readonly text: string
  readonly uri: string
  readonly version: number
}

type DidChangeDocument = {
  readonly contentChanges: readonly TextDocumentContentChange[]
  readonly uri: string
}

type TextDocumentContentChange = {
  readonly range?: {
    readonly start: { readonly line: number; readonly character: number }
    readonly end: { readonly line: number; readonly character: number }
  }
  readonly text?: string
}

export type LspProxySocket = {
  close(): unknown
  send(message: string): unknown
}

export type LspProxyClientSession = {
  handleClientMessage(message: string | ArrayBuffer | Uint8Array): Promise<void>
  dispose(): void
}

const DEFAULT_IDLE_TIMEOUT_MS = 120_000

/**
 * The seam `lspRoutes` depends on. `LspSessionPool` satisfies it structurally,
 * so a route test can hand in a stub without spawning a fake child process.
 */
export type LspSessionSource = {
  acquire(
    socket: LspProxySocket,
    match: LspServerMatch,
    rootPath: string,
  ): Promise<LspProxyClientSession | null>
}

/**
 * Owns every pooled language-server child process belonging to one app.
 *
 * This was two module-level Maps. `createApp` had no handle on them, so
 * `closeApp()` left jdtls/gopls/rust-analyzer running on the developer's
 * machine, and the pool key — server id plus root, no app identity — handed two
 * apps in one process each other's backends. The pool is now constructed in
 * `createApp` and torn down by `appCleanup`.
 */
export class LspSessionPool implements LspSessionSource {
  private readonly sessions = new Map<string, PooledLspProxySession>()
  private readonly starting = new Map<string, Promise<PooledLspProxySession | null>>()
  private disposed = false

  /** Live pooled backends. Read by teardown assertions. */
  get size(): number {
    return this.sessions.size
  }

  async acquire(
    socket: LspProxySocket,
    match: LspServerMatch,
    rootPath: string,
  ): Promise<LspProxyClientSession | null> {
    if (this.disposed) return null

    const session = await this.pooledSession(match, rootPath)
    if (!session) return null
    // `pooledSession` is async, so shutdown can land in the await gap.
    if (this.disposed || session.isDisposed) return null

    return session.connect(socket)
  }

  /**
   * Kills every backend and closes every client socket.
   *
   * Idempotent on purpose: Elysia's `.onStop` and an explicit `closeApp()` can
   * both fire for the same app, and a second kill would log a second session
   * event for a process that is already gone.
   */
  disposeAll(): void {
    if (this.disposed) return

    this.disposed = true
    // Array copy: `dispose` calls back into `remove` and mutates the map.
    for (const session of Array.from(this.sessions.values())) session.dispose('app_shutdown')
    this.sessions.clear()
  }

  remove(session: PooledLspProxySession): void {
    if (this.sessions.get(session.key) !== session) return

    this.sessions.delete(session.key)
  }

  private async pooledSession(match: LspServerMatch, rootPath: string) {
    const key = lspProxySessionKey(match)
    const existing = this.sessions.get(key)
    if (existing && !existing.isDisposed) return existing
    if (existing) this.sessions.delete(key)

    const starting = this.starting.get(key)
    if (starting) return starting

    return this.startSession(key, match, rootPath)
  }

  private startSession(key: string, match: LspServerMatch, rootPath: string) {
    const created = PooledLspProxySession.spawn(key, match, rootPath, this)
      .then((session) => this.adoptSession(key, session))
      .finally(() => this.starting.delete(key))
    this.starting.set(key, created)
    return created
  }

  /**
   * A spawn still in flight when the app shuts down would otherwise land in the
   * map after teardown and orphan the child process. Kill it on arrival.
   */
  private adoptSession(key: string, session: PooledLspProxySession | null) {
    if (!session) return null
    if (this.disposed) {
      session.dispose('pool_disposed')
      return null
    }

    this.sessions.set(key, session)
    return session
  }
}

class PooledLspProxySession {
  private readonly connections = new Set<LspProxyConnection>()
  private readonly documents = new Map<string, SharedDocument>()
  readonly key: string
  private readonly match: LspServerMatch
  private readonly pendingRequests = new Map<JsonRpcId, PendingBackendRequest>()
  private readonly pool: LspSessionPool
  private readonly process: ChildProcessWithoutNullStreams
  private readonly reader: LspStdioMessageReader
  private readonly rootPath: string
  private backendRequestId = 1
  private clientBytes = 0
  private clientMessageCount = 0
  private connectionCount = 0
  private disposed = false
  private exitCode: number | null = null
  private exitSignal: NodeJS.Signals | null = null
  private idleTimer: ReturnType<typeof setTimeout> | null = null
  private initializePromise: Promise<JsonRpcResponse> | null = null
  private initializeResult: JsonRpcResponse | null = null
  private initializedNotificationSent = false
  private openedAt = performance.now()
  private serverBytes = 0
  private serverHandledRequestCount = 0
  private serverMessageCount = 0
  private stderrBytes = 0
  private stderrCount = 0
  private stderrTail = ''

  private constructor(
    key: string,
    match: LspServerMatch,
    process: ChildProcessWithoutNullStreams,
    rootPath: string,
    pool: LspSessionPool,
  ) {
    this.key = key
    this.match = match
    this.pool = pool
    this.process = process
    this.rootPath = rootPath
    this.reader = new LspStdioMessageReader((message) => this.handleServerMessage(message))
    this.bindProcess()
  }

  static async spawn(key: string, match: LspServerMatch, rootPath: string, pool: LspSessionPool) {
    const handle = await match.server.spawn(match.root)
    if (!handle) return null

    return new PooledLspProxySession(key, match, handle.process, rootPath, pool)
  }

  get isDisposed() {
    return this.disposed
  }

  connect(socket: LspProxySocket): LspProxyClientSession {
    this.clearIdleTimer()
    const connection = new LspProxyConnection(socket, this)
    this.connections.add(connection)
    this.connectionCount += 1
    return connection
  }

  async handleClientMessage(
    connection: LspProxyConnection,
    message: string | ArrayBuffer | Uint8Array,
  ): Promise<void> {
    if (this.disposed) return

    const encoded = normalizeClientMessage(message)
    if (!encoded) return

    this.clientBytes += byteLength(encoded)
    this.clientMessageCount += 1
    await this.routeClientMessage(connection, encoded)
  }

  releaseConnection(connection: LspProxyConnection): void {
    if (!this.connections.delete(connection)) return

    this.cancelPendingRequestsForConnection(connection)
    for (const uri of connection.documentUris()) this.releaseDocumentOwner(connection, uri)
    if (this.connections.size === 0) this.scheduleIdleDisposal()
  }

  private bindProcess(): void {
    this.process.stdout.on('data', (chunk) => this.reader.push(chunk))
    this.process.stderr.on('data', (chunk) => this.logStderr(chunk))
    this.process.once('exit', (code, signal) => {
      this.exitCode = code
      this.exitSignal = signal
      this.closeFromProcess('process_exit')
    })
    this.process.once('error', () => this.closeFromProcess('process_error'))
  }

  private async routeClientMessage(connection: LspProxyConnection, encoded: string): Promise<void> {
    const parsed = parseJsonMessage(encoded)
    if (isJsonRpcRequest(parsed)) return this.handleClientRequest(connection, parsed)
    if (isJsonRpcNotification(parsed)) return this.handleClientNotification(connection, parsed)

    this.writeToServer(encoded)
  }

  private async handleClientRequest(
    connection: LspProxyConnection,
    message: JsonRpcRequest,
  ): Promise<void> {
    if (message.method === 'initialize') return this.handleInitializeRequest(connection, message)
    if (message.method === 'shutdown') {
      connection.send(jsonRpcResult(message.id, null))
      return
    }

    this.forwardClientRequest(connection, message)
  }

  private async handleInitializeRequest(
    connection: LspProxyConnection,
    message: JsonRpcRequest,
  ): Promise<void> {
    try {
      const response = await this.ensureInitialized(message)
      connection.send(JSON.stringify(responseForClient(response, message.id)))
    } catch (error) {
      connection.send(jsonRpcError(message.id, -32000, errorMessage(error)))
    }
  }

  private ensureInitialized(message: JsonRpcRequest): Promise<JsonRpcResponse> {
    if (this.initializeResult) return Promise.resolve(this.initializeResult)
    if (this.initializePromise) return this.initializePromise

    this.initializePromise = this.sendInitializeRequest(message)
    return this.initializePromise
  }

  private async sendInitializeRequest(message: JsonRpcRequest): Promise<JsonRpcResponse> {
    const prepared = await this.initializeRequest(message)
    const backendId = this.nextBackendRequestId()
    const response = new Promise<JsonRpcResponse>((resolve, reject) => {
      this.pendingRequests.set(backendId, {
        clientId: message.id,
        connection: null,
        method: 'initialize',
        reject,
        resolve,
      })
    })

    this.writeToServer(JSON.stringify({ ...prepared, id: backendId }))
    return response
      .then((result) => {
        this.initializeResult = result
        return result
      })
      .catch((error: unknown) => {
        this.initializePromise = null
        throw error
      })
  }

  private async initializeRequest(message: JsonRpcRequest): Promise<JsonRpcRequest> {
    const params = isRecord(message.params) ? { ...message.params } : {}
    params.rootUri = fileUriForPath(this.match.root)
    params.workspaceFolders = [
      {
        name: this.match.server.id,
        uri: fileUriForPath(this.match.root),
      },
    ]
    params.processId = this.process.pid ?? null
    await this.applyInitializationOptions(params)
    return { ...message, params }
  }

  private async applyInitializationOptions(params: Record<string, unknown>): Promise<void> {
    const options = await this.match.server.initializationOptions?.(this.match.root)
    if (!options) return

    params.initializationOptions = {
      ...(isRecord(params.initializationOptions) ? params.initializationOptions : {}),
      ...options,
    }
  }

  private async handleClientNotification(
    connection: LspProxyConnection,
    message: JsonRpcNotification,
  ): Promise<void> {
    if (message.method === '$/cancelRequest')
      return this.forwardCancelNotification(connection, message)
    if (message.method === 'initialized') return this.forwardInitializedNotification(message)
    if (message.method === 'exit') {
      connection.dispose()
      return
    }
    if (message.method === 'textDocument/didOpen') return this.handleDidOpen(connection, message)
    if (message.method === 'textDocument/didChange') return this.handleDidChange(message)
    if (message.method === 'textDocument/didClose') return this.handleDidClose(connection, message)

    this.writeToServer(JSON.stringify(message))
  }

  private forwardCancelNotification(
    connection: LspProxyConnection,
    message: JsonRpcNotification,
  ): void {
    const clientId = cancellationRequestId(message.params)
    const backendId = clientId === null ? null : connection.backendRequestIdFor(clientId)
    if (backendId === null) return

    this.writeToServer(
      JSON.stringify({
        ...message,
        params: {
          ...(isRecord(message.params) ? message.params : {}),
          id: backendId,
        },
      }),
    )
  }

  private async forwardInitializedNotification(message: JsonRpcNotification): Promise<void> {
    if (this.initializedNotificationSent) return

    this.initializedNotificationSent = true
    if (!this.initializeResult && this.initializePromise) await this.initializePromise
    if (this.disposed) return

    this.writeToServer(JSON.stringify(message))
  }

  private handleDidOpen(connection: LspProxyConnection, message: JsonRpcNotification): void {
    const document = didOpenDocument(message.params)
    if (!document) {
      this.writeToServer(JSON.stringify(message))
      return
    }

    connection.addDocument(document.uri)
    const shared = this.documents.get(document.uri)
    if (shared) {
      this.attachExistingDocument(connection, shared, document.text)
      return
    }

    this.openBackendDocument(document, connection, message)
  }

  private attachExistingDocument(
    connection: LspProxyConnection,
    document: SharedDocument,
    text: string,
  ): void {
    document.owners.add(connection)
    if (document.text === text) return

    this.forwardFullDocumentChange(document, text)
  }

  private openBackendDocument(
    document: DidOpenDocument,
    owner: LspProxyConnection,
    message: JsonRpcNotification,
  ): void {
    const shared = {
      backendVersion: document.version,
      languageId: document.languageId,
      owners: new Set([owner]),
      text: document.text,
    } satisfies SharedDocument
    this.documents.set(document.uri, shared)
    this.writeToServer(JSON.stringify(rewriteDidOpenVersion(message, shared.backendVersion)))
  }

  private handleDidChange(message: JsonRpcNotification): void {
    const change = didChangeDocument(message.params)
    if (!change) {
      this.writeToServer(JSON.stringify(message))
      return
    }

    const document = this.documents.get(change.uri)
    if (!document) return

    document.backendVersion += 1
    document.text = applyContentChanges(document.text, change.contentChanges)
    this.writeToServer(JSON.stringify(rewriteDidChangeVersion(message, document.backendVersion)))
  }

  private handleDidClose(connection: LspProxyConnection, message: JsonRpcNotification): void {
    const uri = textDocumentUri(message.params)
    if (!uri) {
      this.writeToServer(JSON.stringify(message))
      return
    }

    this.releaseDocumentOwner(connection, uri)
  }

  private releaseDocumentOwner(connection: LspProxyConnection, uri: string): void {
    connection.deleteDocument(uri)
    const document = this.documents.get(uri)
    if (!document) return

    document.owners.delete(connection)
    if (document.owners.size > 0) return

    this.documents.delete(uri)
    this.writeToServer(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'textDocument/didClose',
        params: { textDocument: { uri } },
      }),
    )
  }

  private forwardFullDocumentChange(document: SharedDocument, text: string): void {
    document.backendVersion += 1
    document.text = text
    this.writeToServer(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'textDocument/didChange',
        params: {
          contentChanges: [{ text }],
          textDocument: {
            uri: documentUriForSharedDocument(this.documents, document),
            version: document.backendVersion,
          },
        },
      }),
    )
  }

  private forwardClientRequest(connection: LspProxyConnection, message: JsonRpcRequest): void {
    const backendId = this.nextBackendRequestId()
    this.pendingRequests.set(backendId, {
      clientId: message.id,
      connection,
      method: message.method,
    })
    connection.trackRequest(message.id, backendId)
    this.writeToServer(JSON.stringify({ ...message, id: backendId }))
  }

  private handleServerMessage(message: string): void {
    this.serverBytes += Buffer.byteLength(message, 'utf8')
    this.serverMessageCount += 1
    const parsed = parseJsonMessage(message)
    if (isJsonRpcRequest(parsed)) {
      this.handleServerRequestMessage(parsed)
      return
    }
    if (isJsonRpcResponse(parsed)) return this.handleServerResponse(parsed)
    if (isJsonRpcNotification(parsed)) return this.broadcastServerNotification(parsed, message)

    this.broadcastServerMessage(message)
  }

  private handleServerResponse(message: JsonRpcResponse): void {
    const pending = this.pendingRequests.get(message.id)
    if (!pending) return

    this.pendingRequests.delete(message.id)
    pending.connection?.untrackRequest(pending.clientId)
    if (pending.resolve) {
      pending.resolve(message)
      return
    }

    pending.connection?.send(JSON.stringify(responseForClient(message, pending.clientId)))
  }

  private handleServerRequestMessage(message: JsonRpcRequest): void {
    if (this.handleServerRequest(message)) {
      this.serverHandledRequestCount += 1
      return
    }

    this.respondToServerError(message.id, -32601, `Method not implemented: ${message.method}`)
    this.serverHandledRequestCount += 1
  }

  private handleServerRequest(message: JsonRpcRequest): boolean {
    if (message.method === 'workspace/configuration') {
      this.respondToServer(message.id, [{}])
      return true
    }
    if (message.method === 'workspace/workspaceFolders') {
      this.respondToServer(message.id, [
        {
          name: this.match.server.id,
          uri: fileUriForPath(this.match.root),
        },
      ])
      return true
    }
    if (message.method === 'window/workDoneProgress/create') {
      this.respondToServer(message.id, null)
      return true
    }
    if (message.method === 'client/registerCapability') {
      this.respondToServer(message.id, null)
      return true
    }
    if (message.method === 'client/unregisterCapability') {
      this.respondToServer(message.id, null)
      return true
    }

    return false
  }

  private respondToServer(id: JsonRpcId, result: unknown): void {
    this.writeToServer(jsonRpcResult(id, result))
  }

  private respondToServerError(id: JsonRpcId, code: number, message: string): void {
    this.writeToServer(jsonRpcError(id, code, message))
  }

  private broadcastServerNotification(message: JsonRpcNotification, raw: string): void {
    this.broadcastServerMessage(serverNotificationForClient(message, raw))
  }

  private broadcastServerMessage(message: string): void {
    for (const connection of this.connections) connection.send(message)
  }

  private writeToServer(message: string): void {
    if (this.disposed) return

    writeLspStdioMessage(this.process.stdin, message)
  }

  private nextBackendRequestId(): JsonRpcId {
    const id = `platform-${this.backendRequestId}`
    this.backendRequestId += 1
    return id
  }

  private cancelPendingRequestsForConnection(connection: LspProxyConnection): void {
    for (const [backendId, pending] of Array.from(this.pendingRequests)) {
      if (pending.connection !== connection) continue

      this.pendingRequests.delete(backendId)
      this.writeToServer(
        JSON.stringify({
          jsonrpc: '2.0',
          method: '$/cancelRequest',
          params: { id: backendId },
        }),
      )
    }
  }

  private scheduleIdleDisposal(): void {
    this.clearIdleTimer()
    const timer = setTimeout(() => this.dispose('idle_timeout'), lspIdleTimeoutMs())
    // A 120-second handle must not be the reason the process refuses to exit.
    timer.unref()
    this.idleTimer = timer
  }

  private clearIdleTimer(): void {
    if (!this.idleTimer) return

    clearTimeout(this.idleTimer)
    this.idleTimer = null
  }

  private closeFromProcess(outcome: string): void {
    if (this.disposed) return

    this.disposed = true
    this.clearIdleTimer()
    this.pool.remove(this)
    this.rejectPendingRequests(createInternalError(`LSP process closed: ${outcome}`))
    this.recordSession(outcome)
    this.closeConnections()
  }

  /**
   * Public because the pool disposes its sessions on app shutdown; before that,
   * only the idle timer could reach it.
   */
  dispose(outcome: string): void {
    if (this.disposed) return

    this.disposed = true
    this.clearIdleTimer()
    this.pool.remove(this)
    // Rejected before the sockets close so an in-flight `initialize` can still
    // deliver its JSON-RPC error. Ordinary forwarded requests carry no reject
    // handler: their client learns the turn is over from the socket closing.
    this.rejectPendingRequests(createInternalError(`LSP session disposed: ${outcome}`))
    this.process.kill()
    // Before `closeConnections`, so `activeConnectionCount` reports how many
    // clients shutdown actually cut off.
    this.recordSession(outcome)
    this.closeConnections()
  }

  private closeConnections(): void {
    for (const connection of this.connections) connection.closeSocket()
    this.connections.clear()
  }

  private rejectPendingRequests(error: Error): void {
    for (const pending of this.pendingRequests.values()) pending.reject?.(error)

    this.pendingRequests.clear()
  }

  private logStderr(chunk: Buffer | Uint8Array | string): void {
    const text = Buffer.from(chunk).toString('utf8').trim()
    if (!text) return

    this.stderrBytes += Buffer.byteLength(text, 'utf8')
    this.stderrCount += 1
    this.stderrTail = limitText(`${this.stderrTail}\n${text}`.trim(), 1_000)
  }

  private recordSession(outcome: string): void {
    const context = {
      activeConnectionCount: this.connections.size,
      area: 'lsp',
      clientBytes: this.clientBytes,
      clientMessageCount: this.clientMessageCount,
      connectionCount: this.connectionCount,
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

class LspProxyConnection implements LspProxyClientSession {
  private readonly documents = new Set<string>()
  private readonly requestIds = new Map<JsonRpcId, JsonRpcId>()
  private readonly session: PooledLspProxySession
  private readonly socket: LspProxySocket
  private closed = false

  constructor(socket: LspProxySocket, session: PooledLspProxySession) {
    this.socket = socket
    this.session = session
  }

  async handleClientMessage(message: string | ArrayBuffer | Uint8Array): Promise<void> {
    if (this.closed) return

    await this.session.handleClientMessage(this, message)
  }

  dispose(): void {
    if (this.closed) return

    this.closed = true
    this.session.releaseConnection(this)
  }

  send(message: string): void {
    if (this.closed) return

    this.socket.send(message)
  }

  closeSocket(): void {
    if (this.closed) return

    this.closed = true
    this.socket.close()
  }

  addDocument(uri: string): void {
    this.documents.add(uri)
  }

  deleteDocument(uri: string): void {
    this.documents.delete(uri)
  }

  documentUris(): readonly string[] {
    return Array.from(this.documents)
  }

  trackRequest(clientId: JsonRpcId, backendId: JsonRpcId): void {
    this.requestIds.set(clientId, backendId)
  }

  untrackRequest(clientId: JsonRpcId): void {
    this.requestIds.delete(clientId)
  }

  backendRequestIdFor(clientId: JsonRpcId): JsonRpcId | null {
    return this.requestIds.get(clientId) ?? null
  }
}

function lspProxySessionKey(match: LspServerMatch): string {
  return `${match.server.id}\u0000${match.root}`
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

function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  if (!isRecord(value)) return false
  if (typeof value.method !== 'string') return false
  if (!('id' in value)) return false

  return isJsonRpcId(value.id)
}

function isJsonRpcNotification(value: unknown): value is JsonRpcNotification {
  if (!isRecord(value)) return false
  if (typeof value.method !== 'string') return false

  return !('id' in value)
}

function isJsonRpcResponse(value: unknown): value is JsonRpcResponse {
  if (!isRecord(value)) return false
  if (!('id' in value)) return false
  if ('method' in value) return false
  if (!('result' in value) && !('error' in value)) return false

  return isJsonRpcId(value.id)
}

function isJsonRpcId(value: unknown): value is JsonRpcId {
  return typeof value === 'number' || typeof value === 'string' || value === null
}

function didOpenDocument(params: unknown): DidOpenDocument | null {
  if (!isRecord(params)) return null
  if (!isRecord(params.textDocument)) return null

  const document = params.textDocument
  if (typeof document.uri !== 'string') return null
  if (typeof document.languageId !== 'string') return null
  if (typeof document.text !== 'string') return null

  return {
    languageId: document.languageId,
    text: document.text,
    uri: document.uri,
    version: typeof document.version === 'number' ? document.version : 0,
  }
}

function didChangeDocument(params: unknown): DidChangeDocument | null {
  if (!isRecord(params)) return null
  if (!isRecord(params.textDocument)) return null
  if (!Array.isArray(params.contentChanges)) return null

  const uri = params.textDocument.uri
  if (typeof uri !== 'string') return null

  return {
    contentChanges: params.contentChanges.filter(isTextDocumentContentChange),
    uri,
  }
}

function isTextDocumentContentChange(value: unknown): value is TextDocumentContentChange {
  if (!isRecord(value)) return false

  return typeof value.text === 'string'
}

function textDocumentUri(params: unknown): string | null {
  if (!isRecord(params)) return null
  if (!isRecord(params.textDocument)) return null

  return typeof params.textDocument.uri === 'string' ? params.textDocument.uri : null
}

function cancellationRequestId(params: unknown): JsonRpcId | null {
  if (!isRecord(params)) return null

  return isJsonRpcId(params.id) ? params.id : null
}

function rewriteDidOpenVersion(message: JsonRpcNotification, version: number) {
  const params = isRecord(message.params) ? message.params : {}
  const textDocument = isRecord(params.textDocument) ? params.textDocument : {}
  return {
    ...message,
    params: {
      ...params,
      textDocument: { ...textDocument, version },
    },
  }
}

function rewriteDidChangeVersion(message: JsonRpcNotification, version: number) {
  const params = isRecord(message.params) ? message.params : {}
  const textDocument = isRecord(params.textDocument) ? params.textDocument : {}
  return {
    ...message,
    params: {
      ...params,
      textDocument: { ...textDocument, version },
    },
  }
}

function responseForClient(response: JsonRpcResponse, id: JsonRpcId): JsonRpcResponse {
  return { ...response, id }
}

function jsonRpcResult(id: JsonRpcId, result: unknown): string {
  return JSON.stringify({
    id,
    jsonrpc: '2.0',
    result,
  })
}

function jsonRpcError(id: JsonRpcId, code: number, message: string): string {
  return JSON.stringify({
    error: { code, message },
    id,
    jsonrpc: '2.0',
  })
}

function serverNotificationForClient(message: JsonRpcNotification, raw: string): string {
  if (message.method !== 'textDocument/publishDiagnostics') return raw
  if (!isRecord(message.params)) return raw

  const { version: _version, ...params } = message.params
  return JSON.stringify({ ...message, params })
}

function documentUriForSharedDocument(
  documents: Map<string, SharedDocument>,
  target: SharedDocument,
): string {
  for (const [uri, document] of documents) {
    if (document === target) return uri
  }

  return ''
}

function applyContentChanges(text: string, changes: readonly TextDocumentContentChange[]): string {
  let next = text
  for (const change of changes) next = applyContentChange(next, change)

  return next
}

function applyContentChange(text: string, change: TextDocumentContentChange): string {
  if (typeof change.text !== 'string') return text
  if (!change.range) return change.text

  const start = offsetForPosition(text, change.range.start)
  const end = offsetForPosition(text, change.range.end)
  return `${text.slice(0, start)}${change.text}${text.slice(end)}`
}

function offsetForPosition(
  text: string,
  position: { readonly line: number; readonly character: number },
): number {
  let line = 0
  let lineStart = 0
  for (let index = 0; index < text.length; index += 1) {
    if (line >= position.line) break
    if (text[index] !== '\n') continue

    line += 1
    lineStart = index + 1
  }

  return line < position.line ? text.length : clampOffset(lineStart + position.character, text)
}

function clampOffset(offset: number, text: string): number {
  return Math.min(text.length, Math.max(0, offset))
}

function fileUriForPath(filePath: string): string {
  const normalized = filePath.replace(/^\/+/, '')
  return `file:///${normalized.split('/').map(encodeURIComponent).join('/')}`
}

function byteLength(value: string | ArrayBuffer | Uint8Array): number {
  if (typeof value === 'string') return Buffer.byteLength(value, 'utf8')
  if (value instanceof ArrayBuffer) return value.byteLength

  return value.byteLength
}

function lspIdleTimeoutMs(): number {
  const raw = process.env.PLATFORM_LSP_IDLE_TIMEOUT_MS ?? process.env.FS_LSP_IDLE_TIMEOUT_MS
  const parsed = Number(raw)
  if (Number.isFinite(parsed) && parsed >= 0) return parsed

  return DEFAULT_IDLE_TIMEOUT_MS
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message

  return String(error)
}

function isFailedLspSession(
  outcome: string,
  exitCode: number | null,
  exitSignal: NodeJS.Signals | null,
): boolean {
  if (outcome === 'process_error') return true
  if (outcome !== 'process_exit') return false
  if (exitSignal) return true

  return exitCode !== 0
}
