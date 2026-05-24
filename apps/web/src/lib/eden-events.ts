export type EdenSseEvent = {
  event: string
  data: unknown
}

export async function* parseEdenSseStream(stream: unknown): AsyncGenerator<EdenSseEvent> {
  if (!isAsyncIterable(stream)) {
    throw new Error('Eden response did not include an SSE stream.')
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
    data: 'data' in chunk ? chunk.data : null,
  }
}
