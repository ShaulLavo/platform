import { isRecord } from '@workspace/contracts'
import { Elysia } from 'elysia'

import { authenticateWebSocketData, type AuthConfig } from '../auth'
import {
  orchestrationCommandSummary,
  orchestrationReplaySummary,
  recordChatPipelineInfo,
  recordChatPipelineWarning,
} from './orchestration-logging'
import type { OrchestrationEngine } from './engine'
import {
  orchestrationWsClientMessageSchema,
  type OrchestrationShellStreamItem,
  type OrchestrationThreadStreamItem,
  type OrchestrationWsClientMessage,
  type OrchestrationWsRequest,
  type OrchestrationWsServerMessage,
  type OrchestrationWsSubscribe,
  type OrchestrationWsSubscriptionId,
} from './schemas'

type OrchestrationRpcWebSocket = {
  close(): unknown
  data: unknown
  key: object
  send(message: string): unknown
}

type OrchestrationRpcConnectionState = {
  subscriptions: Map<OrchestrationWsSubscriptionId, OrchestrationRpcSubscription>
}

type OrchestrationRpcSubscription = {
  abortController: AbortController
  method: OrchestrationWsSubscribe['method']
  threadId?: string
}

type OrchestrationStreamItem = OrchestrationShellStreamItem | OrchestrationThreadStreamItem

export function orchestrationWsRoutes(engine: OrchestrationEngine, auth: AuthConfig) {
  const states = new WeakMap<object, OrchestrationRpcConnectionState>()

  return new Elysia({ name: 'orchestration-ws-rpc' }).ws('/orchestration/rpc', {
    body: orchestrationWsClientMessageSchema,
    open(ws) {
      const socket = orchestrationRpcWebSocket(ws)
      if (!socket) return

      const authError = authenticateWebSocketData(socket.data, auth)
      if (authError) {
        recordChatPipelineWarning('chat.pipeline.ws.auth_failed', {
          errorCode: authError.code,
          status: authError.statusCode,
        })
        socket.close()
        return
      }

      states.set(socket.key, { subscriptions: new Map() })
      recordChatPipelineInfo('chat.pipeline.ws.open')
    },
    message(ws, message) {
      const socket = orchestrationRpcWebSocket(ws)
      if (!socket) return

      const state = states.get(socket.key)
      if (!state) return

      handleOrchestrationRpcMessage(engine, socket, state, message)
    },
    close(ws) {
      const socket = orchestrationRpcWebSocket(ws)
      if (!socket) return

      const state = states.get(socket.key)
      const subscriptionCount = state?.subscriptions.size ?? 0
      if (state) closeOrchestrationRpcState(state)

      states.delete(socket.key)
      recordChatPipelineInfo('chat.pipeline.ws.close', {
        subscriptionCount,
      })
    },
  })
}

function handleOrchestrationRpcMessage(
  engine: OrchestrationEngine,
  socket: OrchestrationRpcWebSocket,
  state: OrchestrationRpcConnectionState,
  message: OrchestrationWsClientMessage,
) {
  if (message.kind === 'request') {
    void handleOrchestrationRpcRequest(engine, socket, message)
    return
  }

  if (message.kind === 'subscribe') {
    handleOrchestrationRpcSubscribe(engine, socket, state, message)
    return
  }

  if (message.kind === 'unsubscribe') {
    unsubscribeOrchestrationRpcState(state, message.subscriptionId)
    return
  }

  sendOrchestrationRpcMessage(socket, {
    kind: 'pong',
    requestId: message.requestId,
  })
}

async function handleOrchestrationRpcRequest(
  engine: OrchestrationEngine,
  socket: OrchestrationRpcWebSocket,
  message: OrchestrationWsRequest,
) {
  const startedAt = performance.now()
  const context = orchestrationRpcRequestSummary(message)
  recordChatPipelineInfo('chat.pipeline.ws.request.received', context)

  try {
    const data = await resolveOrchestrationRpcRequest(engine, message)
    sendOrchestrationRpcMessage(socket, {
      data,
      kind: 'response',
      ok: true,
      requestId: message.requestId,
    })
    recordChatPipelineInfo('chat.pipeline.ws.request.complete', {
      ...context,
      durationMs: elapsedMs(startedAt),
    })
  } catch (error) {
    sendOrchestrationRpcMessage(socket, {
      error: serializeOrchestrationRpcError(error),
      kind: 'response',
      ok: false,
      requestId: message.requestId,
    })
    recordChatPipelineWarning('chat.pipeline.ws.request.error', {
      ...context,
      durationMs: elapsedMs(startedAt),
      error,
    })
  }
}

function resolveOrchestrationRpcRequest(
  engine: OrchestrationEngine,
  message: OrchestrationWsRequest,
) {
  if (message.method === 'dispatchCommand') return engine.dispatchClientCommand(message.command)
  if (message.method === 'shellSnapshot') return engine.shellSnapshot()
  if (message.method === 'threadDetailSnapshot')
    return engine.threadDetailSnapshot(message.threadId)

  return engine.replay(message.input)
}

function handleOrchestrationRpcSubscribe(
  engine: OrchestrationEngine,
  socket: OrchestrationRpcWebSocket,
  state: OrchestrationRpcConnectionState,
  message: OrchestrationWsSubscribe,
) {
  unsubscribeOrchestrationRpcState(state, message.subscriptionId)

  const abortController = new AbortController()
  const subscription: OrchestrationRpcSubscription = {
    abortController,
    method: message.method,
    threadId: message.method === 'subscribeThread' ? message.threadId : undefined,
  }
  state.subscriptions.set(message.subscriptionId, subscription)
  recordChatPipelineInfo(
    'chat.pipeline.ws.subscription.start',
    orchestrationRpcSubscribeSummary(message),
  )

  const stream = orchestrationRpcStream(engine, message, abortController.signal)
  void pumpOrchestrationRpcSubscription(socket, state, message.subscriptionId, stream, subscription)
}

async function pumpOrchestrationRpcSubscription(
  socket: OrchestrationRpcWebSocket,
  state: OrchestrationRpcConnectionState,
  subscriptionId: OrchestrationWsSubscriptionId,
  stream: AsyncIterable<OrchestrationStreamItem>,
  subscription: OrchestrationRpcSubscription,
) {
  try {
    for await (const item of stream) {
      if (subscription.abortController.signal.aborted) break

      sendOrchestrationRpcMessage(socket, {
        item,
        kind: 'subscription.next',
        subscriptionId,
      })
    }
  } catch (error) {
    handleOrchestrationRpcSubscriptionError(socket, subscriptionId, subscription, error)
  } finally {
    completeOrchestrationRpcSubscription(socket, state, subscriptionId, subscription)
  }
}

function handleOrchestrationRpcSubscriptionError(
  socket: OrchestrationRpcWebSocket,
  subscriptionId: OrchestrationWsSubscriptionId,
  subscription: OrchestrationRpcSubscription,
  error: unknown,
) {
  if (subscription.abortController.signal.aborted) return

  sendOrchestrationRpcMessage(socket, {
    error: serializeOrchestrationRpcError(error),
    kind: 'subscription.error',
    subscriptionId,
  })
  recordChatPipelineWarning('chat.pipeline.ws.subscription.error', {
    error,
    method: subscription.method,
    subscriptionId,
    threadId: subscription.threadId,
  })
}

function completeOrchestrationRpcSubscription(
  socket: OrchestrationRpcWebSocket,
  state: OrchestrationRpcConnectionState,
  subscriptionId: OrchestrationWsSubscriptionId,
  subscription: OrchestrationRpcSubscription,
) {
  const current = state.subscriptions.get(subscriptionId)
  if (current !== subscription) return

  state.subscriptions.delete(subscriptionId)
  if (!subscription.abortController.signal.aborted) {
    sendOrchestrationRpcMessage(socket, {
      kind: 'subscription.complete',
      subscriptionId,
    })
  }
  recordChatPipelineInfo('chat.pipeline.ws.subscription.closed', {
    aborted: subscription.abortController.signal.aborted,
    method: subscription.method,
    subscriptionId,
    threadId: subscription.threadId,
  })
}

function orchestrationRpcStream(
  engine: OrchestrationEngine,
  message: OrchestrationWsSubscribe,
  signal: AbortSignal,
) {
  if (message.method === 'subscribeShell') {
    return engine.shellStream({ afterSequence: message.afterSequence, signal })
  }

  return engine.threadDetailStream(message.threadId, {
    afterSequence: message.afterSequence,
    signal,
  })
}

function unsubscribeOrchestrationRpcState(
  state: OrchestrationRpcConnectionState,
  subscriptionId: OrchestrationWsSubscriptionId,
) {
  const subscription = state.subscriptions.get(subscriptionId)
  if (!subscription) return

  state.subscriptions.delete(subscriptionId)
  subscription.abortController.abort()
  recordChatPipelineInfo('chat.pipeline.ws.subscription.unsubscribe', {
    method: subscription.method,
    subscriptionId,
    threadId: subscription.threadId,
  })
}

function closeOrchestrationRpcState(state: OrchestrationRpcConnectionState) {
  const subscriptions = [...state.subscriptions.keys()]

  for (const subscriptionId of subscriptions) {
    unsubscribeOrchestrationRpcState(state, subscriptionId)
  }
}

function sendOrchestrationRpcMessage(
  socket: OrchestrationRpcWebSocket,
  message: OrchestrationWsServerMessage,
) {
  try {
    socket.send(JSON.stringify(message))
  } catch (error) {
    recordChatPipelineWarning('chat.pipeline.ws.send_failed', {
      error,
      messageKind: message.kind,
    })
    socket.close()
  }
}

function orchestrationRpcRequestSummary(message: OrchestrationWsRequest) {
  if (message.method === 'dispatchCommand') return orchestrationCommandSummary(message.command)
  if (message.method === 'threadDetailSnapshot')
    return { method: message.method, threadId: message.threadId }
  if (message.method === 'replayEvents') {
    return {
      method: message.method,
      ...orchestrationReplaySummary(message.input),
    }
  }

  return { method: message.method }
}

function orchestrationRpcSubscribeSummary(message: OrchestrationWsSubscribe) {
  if (message.method === 'subscribeThread') {
    return {
      afterSequence: message.afterSequence,
      method: message.method,
      subscriptionId: message.subscriptionId,
      threadId: message.threadId,
    }
  }

  return {
    afterSequence: message.afterSequence,
    method: message.method,
    subscriptionId: message.subscriptionId,
  }
}

function serializeOrchestrationRpcError(error: unknown) {
  if (error instanceof Error) {
    return {
      code: errorStringField(error, 'code'),
      message: error.message,
      name: error.name,
      status: errorNumberField(error, 'statusCode') ?? errorNumberField(error, 'status'),
    }
  }

  return {
    message: String(error),
    name: typeof error,
  }
}

function errorStringField(error: Error, field: string) {
  if (!(field in error)) return undefined

  const value = (error as unknown as Record<string, unknown>)[field]
  return typeof value === 'string' ? value : undefined
}

function errorNumberField(error: Error, field: string) {
  if (!(field in error)) return undefined

  const value = (error as unknown as Record<string, unknown>)[field]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function orchestrationRpcWebSocket(value: unknown): OrchestrationRpcWebSocket | null {
  if (!isRecord(value)) return null
  if (typeof value.send !== 'function') return null

  const close = value.close
  const send = value.send
  return {
    close: () => (typeof close === 'function' ? close.call(value) : undefined),
    data: value.data,
    key: websocketKey(value),
    send: (message) => send.call(value, message),
  }
}

function websocketKey(value: Record<string, unknown>): object {
  return isRecord(value.raw) ? value.raw : value
}

function elapsedMs(startedAt: number) {
  return Math.round((performance.now() - startedAt) * 100) / 100
}
