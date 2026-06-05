import { connectTerminalSocket } from '@/lib/server-sockets'

import { sendTerminalClientMessage } from './terminal-socket'

export function disposeTerminalSession(rootPath: string, sessionId: string) {
  const socket = connectTerminalSocket(rootPath, sessionId)

  socket.addEventListener('open', () => {
    sendTerminalClientMessage(socket, { type: 'dispose' })
    socket.close()
  })
}
