import { describe, expect, it } from "bun:test"

import {
  encodeTerminalClientMessage,
  terminalSocketUrl,
} from "./terminal-socket"

describe("terminal socket client", () => {
  it("builds websocket URLs from the filesystem server URL", () => {
    expect(terminalSocketUrl("project", "http://localhost:3001")).toBe(
      "ws://localhost:3001/terminal?root=project"
    )
    expect(terminalSocketUrl("team app", "https://platform.local")).toBe(
      "wss://platform.local/terminal?root=team+app"
    )
  })

  it("encodes client protocol messages", () => {
    expect(
      encodeTerminalClientMessage({ type: "resize", cols: 120, rows: 32 })
    ).toBe('{"type":"resize","cols":120,"rows":32}')
  })
})
