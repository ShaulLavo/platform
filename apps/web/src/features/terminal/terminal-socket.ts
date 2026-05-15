import type { TerminalClientMessage } from "@workspace/contracts"

import { fsServerUrl } from "@/lib/fs-client"

export function terminalSocketUrl(rootPath: string, serverUrl = fsServerUrl) {
  const url = new URL("/terminal", serverUrl)
  if (url.protocol === "http:") url.protocol = "ws:"
  if (url.protocol === "https:") url.protocol = "wss:"
  url.searchParams.set("root", rootPath)

  return url.toString()
}

export function encodeTerminalClientMessage(message: TerminalClientMessage) {
  return JSON.stringify(message)
}

export function sendTerminalClientMessage(
  socket: WebSocket | null,
  message: TerminalClientMessage
) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false

  socket.send(encodeTerminalClientMessage(message))
  return true
}
