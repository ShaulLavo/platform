import type { Readable } from "node:stream"
import { StringDecoder } from "node:string_decoder"

export const SEARCH_LINE_BUFFER_BYTES = 65_536

type StreamedLine = {
  text: string
  byteLength: number
  terminatorLength: number
}

type LineByteState = {
  maxLineBytes: number
  pending: Buffer
}

const LINE_FEED = 0x0a
const CARRIAGE_RETURN = 0x0d

export async function* readLines(
  stream: NodeJS.ReadableStream | null
): AsyncGenerator<string> {
  if (!stream) return

  const decoder = new StringDecoder("utf8")
  let buffered = ""

  for await (const chunk of stream) {
    buffered += decodeChunk(decoder, chunk)
    const lines = buffered.split(/\r?\n/u)
    buffered = lines.pop() ?? ""

    for (const line of lines) yield line
  }

  buffered += decoder.end()
  if (buffered) yield buffered
}

export async function* streamLines(
  stream: Readable,
  maxLineBytes: number
): AsyncGenerator<StreamedLine> {
  const state: LineByteState = {
    maxLineBytes,
    pending: Buffer.alloc(0),
  }

  for await (const chunk of stream) {
    yield* streamChunkLines(state, toBuffer(chunk))
  }

  if (state.pending.length > 0) yield streamedLine(state.pending, 0)
}

export function collectDecodedStreamTail(
  stream: NodeJS.ReadableStream | null | undefined,
  maxLength = 4_000
) {
  const decoder = new StringDecoder("utf8")
  let tail = ""
  let ended = false

  const finish = () => {
    if (ended) return
    ended = true
    tail = appendTail(tail, decoder.end(), maxLength)
  }

  stream?.on("data", (chunk) => {
    tail = appendTail(tail, decodeChunk(decoder, chunk), maxLength)
  })
  stream?.once("end", finish)
  stream?.once("close", finish)

  return () => {
    finish()
    return tail.trim()
  }
}

function* streamChunkLines(
  state: LineByteState,
  chunk: Buffer
): Generator<StreamedLine> {
  let remaining = chunk

  while (remaining.length > 0) {
    const lfIndex = remaining.indexOf(LINE_FEED)

    if (lfIndex === -1) {
      const consumed = consumeChunkWithoutLineFeed(state, remaining)
      if (consumed.line) yield consumed.line
      remaining = consumed.remaining
      continue
    }

    yield consumeChunkThroughLineFeed(state, remaining, lfIndex)
    remaining = remaining.subarray(lfIndex + 1)
  }
}

function consumeChunkWithoutLineFeed(
  state: LineByteState,
  chunk: Buffer
): { line: StreamedLine | null; remaining: Buffer } {
  const room = state.maxLineBytes - state.pending.length

  if (chunk.length <= room) {
    state.pending = appendPending(state.pending, chunk)
    return { line: null, remaining: Buffer.alloc(0) }
  }

  if (room > 0) {
    state.pending = appendPending(state.pending, chunk.subarray(0, room))
  }

  const line = streamedLine(state.pending, 0)
  state.pending = Buffer.alloc(0)

  return {
    line,
    remaining: chunk.subarray(Math.max(room, 0)),
  }
}

function consumeChunkThroughLineFeed(
  state: LineByteState,
  chunk: Buffer,
  lfIndex: number
) {
  const hasPendingCr =
    lfIndex === 0 &&
    state.pending.length > 0 &&
    state.pending[state.pending.length - 1] === CARRIAGE_RETURN
  const hasChunkCr = lfIndex > 0 && chunk[lfIndex - 1] === CARRIAGE_RETURN
  const lineBytes = lineBytesBeforeFeed(
    state.pending,
    chunk,
    lfIndex,
    hasChunkCr,
    hasPendingCr
  )

  state.pending = Buffer.alloc(0)

  return streamedLine(lineBytes, hasChunkCr || hasPendingCr ? 2 : 1)
}

function lineBytesBeforeFeed(
  pending: Buffer,
  chunk: Buffer,
  lfIndex: number,
  hasChunkCr: boolean,
  hasPendingCr: boolean
) {
  if (hasChunkCr) return appendPending(pending, chunk.subarray(0, lfIndex - 1))
  if (hasPendingCr) return pending.subarray(0, pending.length - 1)

  return appendPending(pending, chunk.subarray(0, lfIndex))
}

function streamedLine(bytes: Buffer, terminatorLength: number): StreamedLine {
  return {
    byteLength: bytes.length,
    terminatorLength,
    text: decodeBuffer(bytes),
  }
}

function appendPending(pending: Buffer, chunk: Buffer) {
  if (pending.length === 0) return chunk
  if (chunk.length === 0) return pending

  return Buffer.concat([pending, chunk])
}

function appendTail(tail: string, text: string, maxLength: number) {
  return `${tail}${text}`.slice(-maxLength)
}

function decodeBuffer(buffer: Buffer) {
  const decoder = new StringDecoder("utf8")
  return decoder.write(buffer) + decoder.end()
}

function decodeChunk(decoder: StringDecoder, chunk: unknown) {
  return decoder.write(toBuffer(chunk))
}

function toBuffer(chunk: unknown) {
  if (Buffer.isBuffer(chunk)) return chunk
  if (typeof chunk === "string") return Buffer.from(chunk)
  if (chunk instanceof Uint8Array) return Buffer.from(chunk)

  return Buffer.from(`${chunk}`)
}
