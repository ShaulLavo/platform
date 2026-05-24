import { sse } from 'elysia'

export type SseEventOptions<T> = {
  data?: (event: T) => unknown
  event: (event: T) => string
}

export type ErrorSseEventOptions<T> = SseEventOptions<T> & {
  errorData: (error: unknown) => unknown
}

export async function* toSse<T>(events: AsyncIterable<T>, options: SseEventOptions<T>) {
  for await (const event of events) {
    yield sse({
      data: options.data?.(event) ?? event,
      event: options.event(event),
    })
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
