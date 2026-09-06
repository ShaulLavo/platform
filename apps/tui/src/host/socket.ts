import { TUI_CLIENT_ORIGIN } from '@workspace/contracts'

// The repository's DOM library masks Bun's constructor overload for request headers.
declare const WebSocket: {
  new (url: string, options: Bun.WebSocketOptions): Bun.WebSocket
}

export function createSocket(url: string, instanceId: string) {
  const socket = new WebSocket(url, {
    headers: { origin: TUI_CLIENT_ORIGIN, 'x-client-instance': instanceId },
  })
  socket.binaryType = 'arraybuffer'
  return socket
}
