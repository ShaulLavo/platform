import type { Writable } from "node:stream"

const HEADER_SEPARATOR = "\r\n\r\n"
const HEADER_SEPARATOR_BYTES = Buffer.byteLength(HEADER_SEPARATOR)

export class LspStdioMessageReader {
  private buffer = Buffer.alloc(0)
  private readonly onMessage: (message: string) => void

  constructor(onMessage: (message: string) => void) {
    this.onMessage = onMessage
  }

  push(chunk: Buffer | Uint8Array | string) {
    this.buffer = Buffer.concat([this.buffer, Buffer.from(chunk)])
    this.drain()
  }

  private drain() {
    while (true) {
      const message = this.nextMessage()
      if (message === null) return

      this.onMessage(message)
    }
  }

  private nextMessage() {
    const headerEnd = this.buffer.indexOf(HEADER_SEPARATOR)
    if (headerEnd === -1) return null

    const headers = this.buffer.subarray(0, headerEnd).toString("ascii")
    const contentLength = contentLengthFromHeaders(headers)
    const bodyStart = headerEnd + HEADER_SEPARATOR_BYTES
    if (contentLength === null) {
      this.buffer = this.buffer.subarray(bodyStart)
      return null
    }

    const bodyEnd = bodyStart + contentLength
    if (this.buffer.length < bodyEnd) return null

    const message = this.buffer.subarray(bodyStart, bodyEnd).toString("utf8")
    this.buffer = this.buffer.subarray(bodyEnd)
    return message
  }
}

export function encodeLspStdioMessage(message: string) {
  return `Content-Length: ${Buffer.byteLength(message, "utf8")}\r\n\r\n${message}`
}

export function writeLspStdioMessage(stream: Writable, message: string) {
  stream.write(encodeLspStdioMessage(message))
}

function contentLengthFromHeaders(headers: string) {
  for (const line of headers.split("\r\n")) {
    const match = /^Content-Length:\s*(\d+)$/iu.exec(line)
    if (!match) continue

    return Number.parseInt(match[1] ?? "", 10)
  }

  return null
}
