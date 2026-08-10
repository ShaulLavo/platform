import {
  ORCHESTRATION_WS_PROTOCOL_VERSION,
  threadIdSchema,
  type OrchestrationWsClientMessage,
} from '@workspace/contracts'
import { describe } from 'vitest'
import * as v from 'valibot'

import { OrchestrationRpcClient } from '@/features/chat/transport/orchestration-rpc-client'
import {
  resetServerConnectionStore,
  useServerConnectionStore,
} from '@/features/chat/state/server-connection-store'
import { expect, test } from '../../../../../test/fixtures'

const HEARTBEAT_MS = 10
const HEARTBEAT_TIMEOUT_MS = 20
const SLOW_REQUEST_MS = 15
const THREAD_ID = v.parse(threadIdSchema, 'thread-1')

describe('orchestration rpc client liveness', () => {
  test('an unanswered heartbeat tears the socket down so subscriptions can reconnect', async () => {
    const socket = new FakeSocket()
    const client = createClient(socket)
    const failure = captureOutcome(client.shellStream()[Symbol.asyncIterator]().next())

    await tick()
    socket.open()
    await tick()

    expect(sentKinds(socket)).toEqual(['subscribe'])

    await sleep(HEARTBEAT_MS * 2)
    expect(sentKinds(socket)).toContain('ping')

    await sleep(HEARTBEAT_TIMEOUT_MS * 2)

    expect(await failure).toMatchObject({ status: 504 })
    expect(socket.closed).toBe(true)
  })

  test('answered heartbeats keep the socket alive', async () => {
    const socket = new FakeSocket()
    socket.autoPong = true
    const client = createClient(socket)
    const outcome = captureOutcome(client.shellStream()[Symbol.asyncIterator]().next())
    let settled = false
    void outcome.then(() => {
      settled = true
    })

    await tick()
    socket.open()
    await sleep(HEARTBEAT_MS * 6)

    expect(sentKinds(socket).filter((kind) => kind === 'ping').length).toBeGreaterThan(1)
    expect(settled).toBe(false)
    expect(socket.closed).toBe(false)
  })

  test('a silent clean close reads as an auth rejection, not a transient drop', async () => {
    const socket = new FakeSocket()
    const client = createClient(socket)
    const failure = captureOutcome(client.shellStream()[Symbol.asyncIterator]().next())

    await tick()
    socket.open()
    await tick()
    socket.serverClose({ code: 1000, wasClean: true })

    expect(await failure).toMatchObject({ status: 401 })
  })
})

describe('orchestration rpc client transport boundary', () => {
  test('the socket offers no authoritative snapshot read', () => {
    const surface = Object.getOwnPropertyNames(OrchestrationRpcClient.prototype)

    // Frames are written in order, so a snapshot for a workspace with hundreds
    // of threads would stall every ping, dispatch and subscription frame behind
    // it. Those two reads belong on `orchestration-http-snapshots.ts`; the
    // subscriptions still deliver `kind: 'snapshot'` frames, which is fine —
    // they are part of the ordered stream rather than a one-shot read.
    expect(surface).not.toContain('shellSnapshot')
    expect(surface).not.toContain('threadDetailSnapshot')
  })
})

describe('orchestration rpc client connection identity', () => {
  test('the handshake tells the client which server process it reached', async () => {
    resetServerConnectionStore()
    const socket = new FakeSocket()
    const client = createClient(socket)
    void captureOutcome(client.shellStream()[Symbol.asyncIterator]().next())

    await tick()
    socket.open()
    socket.deliver({ config: serverConfig('server-1'), kind: 'connected' })

    expect(useServerConnectionStore.getState().serverInstanceId).toBe('server-1')
    expect(useServerConnectionStore.getState().generation).toBe(1)

    // A restart under the same client is the case every server-derived cache
    // has to be told about; nothing else in the client can see it happen.
    socket.deliver({ config: serverConfig('server-2'), kind: 'connected' })

    expect(useServerConnectionStore.getState().generation).toBe(2)
  })

  test('a request that overruns says so, and stops saying so when it answers', async () => {
    resetServerConnectionStore()
    const socket = new FakeSocket()
    const client = createClient(socket, latencyOnly())
    const page = captureOutcome(client.threadDetailPage({ threadId: THREAD_ID }))

    await tick()
    socket.open()
    // The slow timer is armed as the request is written, so waiting on the
    // frame is what makes the timing assertion below deterministic under load.
    await waitForRequest(socket)
    expect(useServerConnectionStore.getState().slowRequestCount).toBe(0)

    await sleep(SLOW_REQUEST_MS * 2)
    expect(useServerConnectionStore.getState().slowRequestCount).toBe(1)

    const requestId = sentMessages(socket).find((message) => message.kind === 'request')?.requestId
    socket.deliver({ data: {}, kind: 'response', ok: true, requestId })
    await page

    expect(useServerConnectionStore.getState().slowRequestCount).toBe(0)
  })

  test('a dropped socket clears the overdue requests it stranded', async () => {
    resetServerConnectionStore()
    const socket = new FakeSocket()
    const client = createClient(socket, latencyOnly())
    const failure = captureOutcome(client.threadDetailPage({ threadId: THREAD_ID }))

    await tick()
    socket.open()
    await waitForRequest(socket)
    await sleep(SLOW_REQUEST_MS * 2)
    expect(useServerConnectionStore.getState().slowRequestCount).toBe(1)

    socket.serverClose({ code: 1006, wasClean: false })
    await failure

    // Otherwise the panel keeps counting a request that can never answer.
    expect(useServerConnectionStore.getState().slowRequestCount).toBe(0)
  })
})

function serverConfig(serverInstanceId: string) {
  return {
    capabilities: { resume: true, synchronizedMarker: true },
    limits: { replayMaxEvents: 1_000, resumeMaxGap: 1_000 },
    protocolVersion: ORCHESTRATION_WS_PROTOCOL_VERSION,
    serverInstanceId,
    serverVersion: '0.0.1',
    startedAt: '2026-08-10T00:00:00.000Z',
  }
}

/**
 * Liveness pushed out of the way so a latency test measures only latency. With
 * the default test heartbeat, an unanswered ping tears the socket down at 30ms
 * — the same moment a 15ms slow timer is being asserted on, and the teardown
 * clears exactly the state under test.
 */
function latencyOnly() {
  return {
    heartbeatIntervalMs: 10_000,
    heartbeatTimeoutMs: 10_000,
    slowRequestMs: SLOW_REQUEST_MS,
  }
}

function createClient(
  socket: FakeSocket,
  overrides: {
    heartbeatIntervalMs?: number
    heartbeatTimeoutMs?: number
    slowRequestMs?: number
  } = {},
) {
  return new OrchestrationRpcClient({
    createSocket: () => socket as unknown as WebSocket,
    heartbeatIntervalMs: HEARTBEAT_MS,
    heartbeatTimeoutMs: HEARTBEAT_TIMEOUT_MS,
    url: () => 'ws://orchestration.test/orchestration/rpc',
    ...overrides,
  })
}

/**
 * Stands in for the browser socket so the test can hold a connection half-open:
 * a real WebSocket cannot be made to stay `OPEN` while ignoring pings.
 */
class FakeSocket {
  autoPong = false
  closed = false
  readyState = 0
  sent: string[] = []
  private listeners = new Map<string, Array<(event: unknown) => void>>()

  addEventListener(type: string, listener: (event: never) => void) {
    const existing = this.listeners.get(type) ?? []
    existing.push(listener as (event: unknown) => void)
    this.listeners.set(type, existing)
  }

  close() {
    this.closed = true
    this.readyState = 3
  }

  send(data: string) {
    this.sent.push(data)
    const message = JSON.parse(data) as OrchestrationWsClientMessage
    if (!this.autoPong || message.kind !== 'ping') return

    setTimeout(() => this.deliver({ kind: 'pong', requestId: message.requestId }), 0)
  }

  open() {
    this.readyState = 1
    this.emit('open', { type: 'open' })
  }

  deliver(message: unknown) {
    this.emit('message', { data: JSON.stringify(message) })
  }

  serverClose({ code, wasClean }: { code: number; wasClean: boolean }) {
    this.readyState = 3
    this.emit('close', { code, reason: '', type: 'close', wasClean })
  }

  private emit(type: string, event: unknown) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event)
    }
  }
}

/** Sending goes through `await connect()`, so it lands some microtasks after `open()`. */
async function waitForRequest(socket: FakeSocket) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (sentKinds(socket).includes('request')) return

    await tick()
  }

  expect.unreachable('the client never sent the request')
}

function sentMessages(socket: FakeSocket) {
  return socket.sent.map((raw) => JSON.parse(raw) as OrchestrationWsClientMessage)
}

function sentKinds(socket: FakeSocket) {
  return sentMessages(socket).map((message) => message.kind)
}

/** Settles with the rejection reason so nothing sits unhandled while a test sleeps. */
function captureOutcome(promise: Promise<unknown>) {
  return promise.then(
    () => null,
    (error: unknown) => error,
  )
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function tick() {
  return sleep(0)
}
