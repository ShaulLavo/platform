import type { TerminalClientMessage } from '@workspace/contracts'

import type { EdenServerSocket } from '@/lib/server-sockets'

const WEB_SOCKET_OPEN = 1

export function encodeTerminalClientMessage(message: TerminalClientMessage) {
  return message.type === 'input' ? message.data : JSON.stringify(message)
}

export function sendTerminalClientMessage(
  socket: EdenServerSocket | null,
  message: TerminalClientMessage,
) {
  if (!socket || socket.readyState !== WEB_SOCKET_OPEN) return false

  socket.send(encodeTerminalClientMessage(message))
  return true
}
