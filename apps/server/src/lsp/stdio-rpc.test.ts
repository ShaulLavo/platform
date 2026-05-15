import { describe, expect, it } from "bun:test"

import { encodeLspStdioMessage, LspStdioMessageReader } from "./stdio-rpc"

describe("LSP stdio framing", () => {
  it("decodes complete framed messages", () => {
    const messages: string[] = []
    const reader = new LspStdioMessageReader((message) => messages.push(message))

    reader.push(encodeLspStdioMessage('{"jsonrpc":"2.0","method":"initialized"}'))

    expect(messages).toEqual(['{"jsonrpc":"2.0","method":"initialized"}'])
  })

  it("buffers partial messages and drains multiple frames", () => {
    const messages: string[] = []
    const reader = new LspStdioMessageReader((message) => messages.push(message))
    const first = encodeLspStdioMessage('{"id":1,"result":null}')
    const second = encodeLspStdioMessage('{"id":2,"result":true}')
    const combined = first + second

    reader.push(combined.slice(0, 15))
    reader.push(combined.slice(15))

    expect(messages).toEqual(['{"id":1,"result":null}', '{"id":2,"result":true}'])
  })
})
