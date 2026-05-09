export type ParsedSseEvent = {
  event: string
  data: unknown
}

export async function* parseSseStream(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<ParsedSseEvent> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()

  try {
    yield* readSseChunks(reader, decoder)
  } finally {
    reader.releaseLock()
  }
}

async function* readSseChunks(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder
): AsyncGenerator<ParsedSseEvent> {
  let buffered = ""

  while (true) {
    const result = await reader.read()
    if (result.done) break

    buffered = yield* yieldParsedSseEvents(
      buffered + decoder.decode(result.value, { stream: true })
    )
  }

  buffered += decoder.decode()
  yield* yieldParsedSseEvents(buffered)
}

function* yieldParsedSseEvents(buffered: string) {
  const parsed = parseBufferedSseEvents(buffered)
  for (const event of parsed.events) yield event
  return parsed.buffered
}

function parseBufferedSseEvents(buffered: string) {
  const events: ParsedSseEvent[] = []
  let remaining = buffered
  let separator = sseSeparatorIndex(remaining)

  while (separator >= 0) {
    const raw = remaining.slice(0, separator)
    remaining = remaining.slice(
      separator + sseSeparatorLength(remaining, separator)
    )
    const event = parseSseEvent(raw)
    if (event) events.push(event)
    separator = sseSeparatorIndex(remaining)
  }

  return { events, buffered: remaining }
}

function sseSeparatorIndex(input: string) {
  const unix = input.indexOf("\n\n")
  const windows = input.indexOf("\r\n\r\n")
  if (unix < 0) return windows
  if (windows < 0) return unix

  return Math.min(unix, windows)
}

function sseSeparatorLength(input: string, index: number) {
  return input.startsWith("\r\n\r\n", index) ? 4 : 2
}

function parseSseEvent(raw: string): ParsedSseEvent | null {
  let event = "message"
  const data: string[] = []

  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("event:")) event = line.slice(6).trim()
    if (line.startsWith("data:")) data.push(line.slice(5).trimStart())
  }

  if (data.length === 0) return null

  return {
    event,
    data: parseSseData(data.join("\n")),
  }
}

function parseSseData(data: string) {
  try {
    return JSON.parse(data) as unknown
  } catch {
    return data
  }
}
