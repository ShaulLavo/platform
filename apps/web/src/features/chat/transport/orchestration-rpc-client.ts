import {
  orchestrationWsServerMessageSchema,
  type ClientOrchestrationCommand,
  type OrchestrationReplayEventsInput,
  type OrchestrationReplayEventsResult,
  type OrchestrationShellSnapshot,
  type OrchestrationShellStreamItem,
  type OrchestrationThreadDetailSnapshot,
  type OrchestrationThreadStreamItem,
  type OrchestrationWsClientMessage,
  type OrchestrationWsError,
  type OrchestrationWsRequest,
  type OrchestrationWsServerMessage,
  type OrchestrationWsSubscribe,
  type OrchestrationWsSubscriptionId,
  type ThreadId,
} from '@workspace/contracts'
import * as v from 'valibot'

import { observeClientOperation, log } from '@/lib/client-logging'
import { serverUrl } from '@/lib/client'
import { clientErrors, createClientError } from '@/lib/structured-errors'
import { chatCommandSummary, chatReplaySummary } from '../lib/chat-pipeline-logging'
import { guardOrchestrationStreamSequence } from './orchestration-sequence'
import type { OrchestrationStreamInput } from './orchestration-streams'

const ORCHESTRATION_RPC_CONNECT_TIMEOUT_MS = 10_000
const ORCHESTRATION_RPC_REQUEST_TIMEOUT_MS = 60_000
const ORCHESTRATION_RPC_HEARTBEAT_MS = 30_000

type PendingRequest = {
  method: OrchestrationWsRequest['method']
  reject: (error: unknown) => void
  resolve: (value: unknown) => void
  startedAt: number
  timeoutId: ReturnType<typeof setTimeout>
}

type RpcSubscription<T> = {
  method: OrchestrationWsSubscribe['method']
  queue: AsyncSubscriptionQueue<T>
  threadId?: ThreadId
}

export class OrchestrationRpcClient {
  private heartbeatId: ReturnType<typeof setInterval> | null = null
  private opening: Promise<WebSocket> | null = null
  private pendingRequests = new Map<string, PendingRequest>()
  private requestCounter = 0
  private socket: WebSocket | null = null
  private subscriptionCounter = 0
  private subscriptions = new Map<OrchestrationWsSubscriptionId, RpcSubscription<unknown>>()

  dispatchCommand(command: ClientOrchestrationCommand) {
    return observeClientOperation(
      {
        action: 'chat.command.rpc',
        area: 'chat',
        ...chatCommandSummary(command),
      },
      async () => {
        const request: OrchestrationWsRequest = {
          command,
          kind: 'request',
          method: 'dispatchCommand',
          requestId: this.nextRequestId('dispatchCommand'),
        }

        return this.sendRequest<{ deduped: boolean; sequence: number }>(request)
      },
      (result) => ({
        deduped: result.deduped,
        sequence: result.sequence,
      }),
    )
  }

  shellSnapshot() {
    return observeClientOperation(
      {
        action: 'chat.shell_snapshot.rpc',
        area: 'chat',
      },
      async () => {
        const request: OrchestrationWsRequest = {
          kind: 'request',
          method: 'shellSnapshot',
          requestId: this.nextRequestId('shellSnapshot'),
        }

        return this.sendRequest<OrchestrationShellSnapshot>(request)
      },
      (snapshot) => ({
        projectCount: snapshot.projects.length,
        snapshotSequence: snapshot.snapshotSequence,
        threadCount: snapshot.threads.length,
      }),
    )
  }

  threadDetailSnapshot(threadId: ThreadId) {
    return observeClientOperation(
      {
        action: 'chat.thread_detail_snapshot.rpc',
        area: 'chat',
        threadId,
      },
      async () => {
        const request: OrchestrationWsRequest = {
          kind: 'request',
          method: 'threadDetailSnapshot',
          requestId: this.nextRequestId('threadDetailSnapshot'),
          threadId,
        }

        return this.sendRequest<OrchestrationThreadDetailSnapshot>(request)
      },
      (snapshot) => ({
        activityCount: snapshot.thread.activities.length,
        latestTurnState: snapshot.thread.latestTurn?.state ?? null,
        messageCount: snapshot.thread.messages.length,
        sessionStatus: snapshot.thread.session?.status ?? null,
        snapshotSequence: snapshot.snapshotSequence,
      }),
    )
  }

  replayEvents(input: OrchestrationReplayEventsInput) {
    return observeClientOperation(
      {
        action: 'chat.replay.rpc',
        area: 'chat',
        ...chatReplaySummary(input),
      },
      async () => {
        const request: OrchestrationWsRequest = {
          input,
          kind: 'request',
          method: 'replayEvents',
          requestId: this.nextRequestId('replayEvents'),
        }

        return this.sendRequest<OrchestrationReplayEventsResult>(request)
      },
      (result) => ({
        eventCount: result.events.length,
        eventTypes: result.events.map((event) => event.type),
        maxSequence: result.events.at(-1)?.sequence ?? input.afterSequence,
      }),
    )
  }

  async *shellStream(input: OrchestrationStreamInput = {}) {
    const afterSequence = input.afterSequence ?? 0
    const subscription: OrchestrationWsSubscribe = {
      afterSequence,
      kind: 'subscribe',
      method: 'subscribeShell',
      subscriptionId: this.nextSubscriptionId('shell'),
    }
    const stream = this.subscribe<OrchestrationShellStreamItem>(subscription, input.signal)

    yield* guardOrchestrationStreamSequence(stream, streamGuardSequence(input.afterSequence))
  }

  async *threadDetailStream(threadId: ThreadId, input: OrchestrationStreamInput = {}) {
    const afterSequence = input.afterSequence ?? 0
    const subscription: OrchestrationWsSubscribe = {
      afterSequence,
      kind: 'subscribe',
      method: 'subscribeThread',
      subscriptionId: this.nextSubscriptionId('thread'),
      threadId,
    }
    const stream = this.subscribe<OrchestrationThreadStreamItem>(subscription, input.signal)

    yield* guardOrchestrationStreamSequence(stream, streamGuardSequence(input.afterSequence))
  }

  private async sendRequest<T>(message: OrchestrationWsRequest): Promise<T> {
    const socket = await this.connect()

    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(message.requestId)
        reject(createOrchestrationRpcTimeoutError(message.method))
      }, ORCHESTRATION_RPC_REQUEST_TIMEOUT_MS)

      this.pendingRequests.set(message.requestId, {
        method: message.method,
        reject,
        resolve: (value) => resolve(value as T),
        startedAt: performance.now(),
        timeoutId,
      })
      try {
        this.sendSocketMessage(socket, message)
      } catch (error) {
        this.pendingRequests.delete(message.requestId)
        clearTimeout(timeoutId)
        reject(error)
      }
    })
  }

  private async *subscribe<T>(message: OrchestrationWsSubscribe, signal?: AbortSignal) {
    if (signal?.aborted) return

    const queue = new AsyncSubscriptionQueue<T>()
    const subscription: RpcSubscription<T> = {
      method: message.method,
      queue,
      threadId: message.method === 'subscribeThread' ? message.threadId : undefined,
    }
    this.subscriptions.set(message.subscriptionId, subscription as RpcSubscription<unknown>)
    const abort = () => queue.close()

    try {
      signal?.addEventListener('abort', abort, { once: true })
      await this.sendClientMessage(message)
      log.info({
        action: 'orchestration.ws.subscription.open',
        afterSequence: message.afterSequence,
        area: 'orchestration',
        method: message.method,
        subscriptionId: message.subscriptionId,
        threadId: subscription.threadId,
      })
      yield* drainSubscriptionQueue(queue)
    } catch (error) {
      if (!signal?.aborted) throw error
    } finally {
      signal?.removeEventListener('abort', abort)
      this.subscriptions.delete(message.subscriptionId)
      this.sendClientMessageIfOpen({
        kind: 'unsubscribe',
        subscriptionId: message.subscriptionId,
      })
      log.info({
        action: 'orchestration.ws.subscription.close',
        aborted: signal?.aborted ?? false,
        area: 'orchestration',
        method: message.method,
        subscriptionId: message.subscriptionId,
        threadId: subscription.threadId,
      })
    }
  }

  private async connect(): Promise<WebSocket> {
    const open = this.openSocket()
    if (open) return open
    if (this.opening) return this.opening

    const socket = new WebSocket(orchestrationRpcUrl())
    this.socket = socket
    this.opening = this.openSocketConnection(socket)

    return this.opening
  }

  private openSocketConnection(socket: WebSocket) {
    return new Promise<WebSocket>((resolve, reject) => {
      let settled = false
      const timeoutId = setTimeout(() => {
        rejectOpening(createOrchestrationRpcConnectTimeoutError())
        socket.close()
      }, ORCHESTRATION_RPC_CONNECT_TIMEOUT_MS)
      const rejectOpening = (error: unknown) => {
        if (settled) return

        settled = true
        clearTimeout(timeoutId)
        this.opening = null
        reject(error)
      }

      socket.addEventListener('open', () => {
        if (settled) return

        settled = true
        clearTimeout(timeoutId)
        this.opening = null
        this.startHeartbeat()
        log.info({
          action: 'orchestration.ws.open',
          area: 'orchestration',
          url: orchestrationRpcUrl(),
        })
        resolve(socket)
      })
      socket.addEventListener('message', (event) => this.handleSocketMessage(event))
      socket.addEventListener('error', (event) => {
        log.warn({
          action: 'orchestration.ws.error',
          area: 'orchestration',
          eventType: event.type,
        })
        rejectOpening(createOrchestrationRpcSocketError())
      })
      socket.addEventListener('close', (event) => {
        rejectOpening(createOrchestrationRpcCloseError(event))
        this.handleSocketClose(socket, event)
      })
    })
  }

  private openSocket() {
    if (this.socket?.readyState === WebSocket.OPEN) return this.socket

    return null
  }

  private async sendClientMessage(message: OrchestrationWsClientMessage) {
    const socket = await this.connect()

    this.sendSocketMessage(socket, message)
  }

  private sendClientMessageIfOpen(message: OrchestrationWsClientMessage) {
    const socket = this.openSocket()
    if (!socket) return

    this.sendSocketMessage(socket, message)
  }

  private sendSocketMessage(socket: WebSocket, message: OrchestrationWsClientMessage) {
    try {
      socket.send(JSON.stringify(message))
    } catch (error) {
      socket.close()
      throw error
    }
  }

  private handleSocketMessage(event: MessageEvent) {
    const message = parseOrchestrationRpcMessage(event.data)
    if (!message) return
    if (message.kind === 'response') {
      this.handleResponseMessage(message)
      return
    }

    if (message.kind === 'subscription.next') {
      this.handleSubscriptionNext(message)
      return
    }

    if (message.kind === 'subscription.error') {
      this.handleSubscriptionError(message)
      return
    }

    if (message.kind === 'subscription.complete') {
      this.subscriptions.get(message.subscriptionId)?.queue.close()
    }
  }

  private handleResponseMessage(
    message: Extract<OrchestrationWsServerMessage, { kind: 'response' }>,
  ) {
    const pending = this.pendingRequests.get(message.requestId)
    if (!pending) return

    this.pendingRequests.delete(message.requestId)
    clearTimeout(pending.timeoutId)
    log.info({
      action: 'orchestration.ws.response',
      area: 'orchestration',
      durationMs: elapsedMs(pending.startedAt),
      method: pending.method,
      ok: message.ok,
    })
    if (message.ok) {
      pending.resolve(message.data)
      return
    }

    pending.reject(createOrchestrationRpcServerError(message.error))
  }

  private handleSubscriptionNext(
    message: Extract<OrchestrationWsServerMessage, { kind: 'subscription.next' }>,
  ) {
    const subscription = this.subscriptions.get(message.subscriptionId)
    if (!subscription) return

    subscription.queue.push(message.item)
  }

  private handleSubscriptionError(
    message: Extract<OrchestrationWsServerMessage, { kind: 'subscription.error' }>,
  ) {
    const subscription = this.subscriptions.get(message.subscriptionId)
    if (!subscription) return

    subscription.queue.fail(createOrchestrationRpcServerError(message.error))
  }

  private handleSocketClose(socket: WebSocket, event: CloseEvent) {
    if (this.socket !== socket) return

    this.socket = null
    this.opening = null
    this.stopHeartbeat()
    const error = createOrchestrationRpcCloseError(event)
    this.rejectPendingRequests(error)
    this.failSubscriptions(error)
    log.warn({
      action: 'orchestration.ws.close',
      area: 'orchestration',
      code: event.code,
      reason: event.reason,
      wasClean: event.wasClean,
    })
  }

  private rejectPendingRequests(error: unknown) {
    const pending = [...this.pendingRequests.values()]
    this.pendingRequests.clear()

    for (const request of pending) {
      clearTimeout(request.timeoutId)
      request.reject(error)
    }
  }

  private failSubscriptions(error: unknown) {
    const subscriptions = [...this.subscriptions.values()]

    for (const subscription of subscriptions) {
      subscription.queue.fail(error)
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat()
    this.heartbeatId = setInterval(() => {
      this.sendClientMessageIfOpen({
        kind: 'ping',
        requestId: this.nextRequestId('ping'),
      })
    }, ORCHESTRATION_RPC_HEARTBEAT_MS)
  }

  private stopHeartbeat() {
    if (this.heartbeatId === null) return

    clearInterval(this.heartbeatId)
    this.heartbeatId = null
  }

  private nextRequestId(method: string) {
    this.requestCounter += 1

    return `orpc-${method}-${this.requestCounter}`
  }

  private nextSubscriptionId(kind: string) {
    this.subscriptionCounter += 1

    return `osub-${kind}-${this.subscriptionCounter}`
  }
}

class AsyncSubscriptionQueue<T> {
  private closed = false
  private error: unknown = null
  private items: T[] = []
  private waiters: Array<{
    reject: (error: unknown) => void
    resolve: (result: IteratorResult<T>) => void
  }> = []

  push(item: T) {
    if (this.closed) return

    const waiter = this.waiters.shift()
    if (waiter) {
      waiter.resolve({ done: false, value: item })
      return
    }

    this.items.push(item)
  }

  fail(error: unknown) {
    if (this.closed) return

    this.error = error
    this.closed = true
    this.items = []
    const waiters = this.drainWaiters()

    for (const waiter of waiters) {
      waiter.reject(error)
    }
  }

  close() {
    if (this.closed) return

    this.closed = true
    const waiters = this.drainWaiters()

    for (const waiter of waiters) {
      waiter.resolve({ done: true, value: undefined })
    }
  }

  next(): Promise<IteratorResult<T>> {
    const item = this.items.shift()
    if (item !== undefined) return Promise.resolve({ done: false, value: item })
    if (this.error !== null) return Promise.reject(this.error)
    if (this.closed) return Promise.resolve({ done: true, value: undefined })

    return new Promise((resolve, reject) => {
      this.waiters.push({ reject, resolve })
    })
  }

  private drainWaiters() {
    const waiters = this.waiters
    this.waiters = []

    return waiters
  }
}

const localOrchestrationRpcClient = new OrchestrationRpcClient()

export const dispatchOrchestrationCommandRpc = localOrchestrationRpcClient.dispatchCommand.bind(
  localOrchestrationRpcClient,
)
export const fetchOrchestrationShellSnapshotRpc = localOrchestrationRpcClient.shellSnapshot.bind(
  localOrchestrationRpcClient,
)
export const fetchOrchestrationThreadDetailSnapshotRpc =
  localOrchestrationRpcClient.threadDetailSnapshot.bind(localOrchestrationRpcClient)
export const replayOrchestrationEventsRpc = localOrchestrationRpcClient.replayEvents.bind(
  localOrchestrationRpcClient,
)
export const subscribeOrchestrationShellRpc = localOrchestrationRpcClient.shellStream.bind(
  localOrchestrationRpcClient,
)
export const subscribeOrchestrationThreadDetailRpc =
  localOrchestrationRpcClient.threadDetailStream.bind(localOrchestrationRpcClient)

async function* drainSubscriptionQueue<T>(queue: AsyncSubscriptionQueue<T>) {
  while (true) {
    const result = await queue.next()
    if (result.done) return

    yield result.value
  }
}

function parseOrchestrationRpcMessage(data: unknown): OrchestrationWsServerMessage | null {
  if (typeof data !== 'string') {
    log.warn({
      action: 'orchestration.ws.message.invalid',
      area: 'orchestration',
      reason: 'non_string_message',
    })
    return null
  }

  try {
    return v.parse(orchestrationWsServerMessageSchema, JSON.parse(data))
  } catch (error) {
    log.warn({
      action: 'orchestration.ws.message.invalid',
      area: 'orchestration',
      error,
    })
    return null
  }
}

function orchestrationRpcUrl() {
  const url = new URL('/orchestration/rpc', serverUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'

  return url.toString()
}

function streamGuardSequence(afterSequence: number | undefined) {
  return afterSequence === undefined ? -1 : afterSequence - 1
}

function createOrchestrationRpcServerError(error: OrchestrationWsError) {
  return createClientError({
    cause: error,
    code: error.code ?? clientErrors.RPC_FAILED.code,
    message: error.message,
    status: error.status ?? clientErrors.RPC_FAILED.status,
    why: clientErrors.RPC_FAILED.why,
    fix: clientErrors.RPC_FAILED.fix,
  })
}

function createOrchestrationRpcTimeoutError(method: string) {
  return createClientError({
    code: 'ORCHESTRATION_RPC_TIMEOUT',
    message: `Orchestration RPC request timed out: ${method}`,
    status: 504,
    why: 'The server did not answer the orchestration WebSocket request before the client timeout.',
    fix: 'Inspect the chat pipeline logs and retry after the server is responsive.',
  })
}

function createOrchestrationRpcConnectTimeoutError() {
  return createClientError({
    code: 'ORCHESTRATION_WS_CONNECT_TIMEOUT',
    message: 'Timed out opening the orchestration WebSocket.',
    status: 504,
    why: 'The browser could not establish the orchestration RPC socket in time.',
    fix: 'Verify the server is running and accepting WebSocket upgrades.',
  })
}

function createOrchestrationRpcSocketError() {
  return createClientError({
    code: 'ORCHESTRATION_WS_ERROR',
    message: 'The orchestration WebSocket reported a transport error.',
    status: 502,
    why: 'The browser socket failed before the server returned a usable response.',
    fix: 'Inspect browser and server logs for the WebSocket failure.',
  })
}

function createOrchestrationRpcCloseError(event: CloseEvent) {
  return createClientError({
    code: 'ORCHESTRATION_WS_CLOSED',
    message: 'The orchestration WebSocket closed before the request completed.',
    status: event.wasClean ? 499 : 502,
    why: 'The shared orchestration RPC connection closed while work was still in flight.',
    fix: 'Reconnect the chat view and inspect the server WebSocket logs if it repeats.',
  })
}

function elapsedMs(startedAt: number) {
  return Math.round((performance.now() - startedAt) * 100) / 100
}
