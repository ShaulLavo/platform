import { describe, expect, it } from 'vitest'

import { SSE_HEARTBEAT_EVENT, toSse } from '../sse'

describe('sse helpers', () => {
  it('emits heartbeat events while waiting for source events', async () => {
    const blocked = createBlockedEvents()
    const stream = toSse(blocked.events, {
      event: () => 'message',
      heartbeatMs: 1,
    })

    const next = stream.next()
    await blocked.started
    const heartbeat = await next

    expect(heartbeat.value).toMatchObject({
      data: null,
      event: SSE_HEARTBEAT_EVENT,
    })
    blocked.release()
    await Promise.resolve()

    const source = await stream.next()

    expect(source.value).toMatchObject({
      data: { value: 1 },
      event: 'message',
    })
    expect(await stream.next()).toMatchObject({ done: true })
  })

  it('emits source events before heartbeat when data is ready', async () => {
    const stream = toSse(singleEvent(), {
      event: () => 'message',
      heartbeatMs: 1000,
    })

    const next = await stream.next()

    expect(next.value).toMatchObject({
      data: { value: 1 },
      event: 'message',
    })
    await stream.return(undefined)
  })
})

function createBlockedEvents() {
  let release: () => void = () => undefined
  let markStarted: () => void = () => undefined
  const started = new Promise<void>((resolve) => {
    markStarted = resolve
  })

  async function* events(): AsyncGenerator<{ value: number }> {
    await new Promise<void>((resolve) => {
      release = resolve
      markStarted()
    })
    yield { value: 1 }
  }

  return { events: events(), release: () => release(), started }
}

async function* singleEvent() {
  yield { value: 1 }
}
