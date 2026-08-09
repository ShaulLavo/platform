import type { OrchestrationWsClientMessage } from '@workspace/contracts'
import { describe } from 'vitest'

import { OrchestrationRpcClient } from '@/features/chat/transport/orchestration-rpc-client'
import { expect, test } from '../../../../../test/fixtures'

const HEARTBEAT_MS = 10
const HEARTBEAT_TIMEOUT_MS = 20

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

function createClient(socket: FakeSocket) {
  return new OrchestrationRpcClient({
    createSocket: () => socket as unknown as WebSocket,
    heartbeatIntervalMs: HEARTBEAT_MS,
    heartbeatTimeoutMs: HEARTBEAT_TIMEOUT_MS,
    url: () => 'ws://orchestration.test/orchestration/rpc',
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
