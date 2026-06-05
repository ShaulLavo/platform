import { clientErrors, createRpcError } from './structured-errors'

export type EdenSseEvent = {
  event: string
  data: unknown
}

export type UnwrapEdenOptions = {
  /** Throw when `data` is null/undefined instead of returning it. */
  requireData?: boolean
  /** Run `data` through `normalizeEdenSseData` before returning. */
  normalizeSse?: boolean
  /** Error message used when `requireData` rejects empty data. */
  emptyMessage?: string
}

export function unwrapEdenResponse<T>(
  response: { data?: T | null; error?: unknown },
  options: UnwrapEdenOptions = {},
): T {
  if (response.error) throw createRpcError(response.error)
  if (options.requireData && response.data == null)
    throw createRpcError(new Error(options.emptyMessage ?? 'server returned an empty response'))

  const data = options.normalizeSse ? normalizeEdenSseData(response.data) : response.data

  return data as T
}

export async function* parseEdenSseStream(stream: unknown): AsyncGenerator<EdenSseEvent> {
  if (!isAsyncIterable(stream)) {
    throw clientErrors.EDEN_STREAM_MISSING({ label: 'Eden' })
  }

  for await (const chunk of stream) {
    const event = edenSseEvent(chunk)
    if (event) yield event
  }
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return value !== null && typeof value === 'object' && Symbol.asyncIterator in value
}

function edenSseEvent(chunk: unknown): EdenSseEvent | null {
  if (!chunk || typeof chunk !== 'object') return null
  if (!('event' in chunk) || typeof chunk.event !== 'string') return null

  return {
    event: chunk.event,
    data: 'data' in chunk ? normalizeEdenSseData(chunk.data) : null,
  }
}

export function normalizeEdenSseData(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(normalizeEdenSseData)
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, normalizeEdenSseData(entry)]),
  )
}
