import { sse } from 'elysia'

export const SSE_HEARTBEAT_EVENT = 'heartbeat'

export type SseEventOptions<T> = {
  data?: (event: T) => unknown
  event: (event: T) => string
  heartbeatMs?: number
}

export type ErrorSseEventOptions<T> = SseEventOptions<T> & {
  errorData: (error: unknown) => unknown
}

export async function* toSse<T>(events: AsyncIterable<T>, options: SseEventOptions<T>) {
  const iterator = events[Symbol.asyncIterator]()
  let nextEvent = iterator.next().then(nextSseEventResult)

  try {
    while (true) {
      const result = await nextSseResult(nextEvent, options.heartbeatMs)
      if (result.kind === 'heartbeat') {
        yield sse({ data: null, event: SSE_HEARTBEAT_EVENT })
        continue
      }

      if (result.event.done) return

      yield sse({
        data: options.data?.(result.event.value) ?? result.event.value,
        event: options.event(result.event.value),
      })
      nextEvent = iterator.next().then(nextSseEventResult)
    }
  } finally {
    await iterator.return?.()
  }
}

export async function* toErrorYieldingSse<T>(
  events: AsyncIterable<T>,
  options: ErrorSseEventOptions<T>,
) {
  try {
    yield* toSse(events, options)
  } catch (error) {
    yield sse({
      data: options.errorData(error),
      event: 'error',
    })
  }
}

type NextSseResult<T> =
  | NextSseEventResult<T>
  | {
      kind: 'heartbeat'
    }

type NextSseEventResult<T> = {
  event: IteratorResult<T>
  kind: 'event'
}

async function nextSseResult<T>(
  nextEvent: Promise<NextSseEventResult<T>>,
  heartbeatMs?: number,
): Promise<NextSseResult<T>> {
  const normalizedHeartbeatMs = normalizeHeartbeatMs(heartbeatMs)
  if (normalizedHeartbeatMs === undefined) return nextEvent

  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      nextEvent,
      new Promise<NextSseResult<T>>((resolve) => {
        timeout = setTimeout(() => resolve({ kind: 'heartbeat' }), normalizedHeartbeatMs)
      }),
    ])
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
  }
}

function nextSseEventResult<T>(event: IteratorResult<T>): NextSseEventResult<T> {
  return { event, kind: 'event' }
}

function normalizeHeartbeatMs(heartbeatMs: number | undefined) {
  if (heartbeatMs === undefined) return undefined
  if (!Number.isFinite(heartbeatMs)) return undefined
  if (heartbeatMs <= 0) return undefined

  return heartbeatMs
}
