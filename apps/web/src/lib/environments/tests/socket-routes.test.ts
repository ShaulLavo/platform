import { vi } from 'vitest'
import { inProcessServerSocketConstructor } from '@workspace/client-core/test/in-process-server-socket'
import { createEnvironmentClient } from '@workspace/client-core/transport/client'

import { connectLanguageServerSocket, connectTerminalSocket } from '@/lib/server-sockets'
import { TEST_WORKTREE_ID } from '../../../../test/factories/chat'
import { expect, test } from '../../../../test/fixtures'
import { TEST_ORIGIN } from '../../../../test/server'

test('web socket adapters observe real terminal and LSP Origin refusals without opening network sockets', async ({
  server,
}) => {
  const Socket = inProcessServerSocketConstructor({
    app: server.app,
    clientOrigin: 'https://untrusted.example',
  })
  const controller = new AbortController()
  vi.stubGlobal('WebSocket', Socket)
  try {
    const client = createEnvironmentClient({ origin: server.origin })
    const terminal = connectTerminalSocket(
      { worktreeId: TEST_WORKTREE_ID, terminalId: 'main' },
      client,
      controller.signal,
    )
    const language = connectLanguageServerSocket(
      { path: 'main.ts', rootPath: '', serverId: 'typescript' },
      client,
      controller.signal,
    )
    await Promise.all(Socket.opened.map((socket) => socket.opening))
    expect(Socket.opened.map((socket) => socket.closeDetails)).toEqual([
      { code: 1008, reason: 'unauthorized' },
      { code: 1008, reason: 'unauthorized' },
    ])
    expect(terminal.readyState).toBe(3)
    expect(language.readyState).toBe(3)
  } finally {
    controller.abort()
    vi.unstubAllGlobals()
  }
})

test('web adapters preserve real invalid-root policy close reasons', async ({ server }) => {
  const Socket = inProcessServerSocketConstructor({ app: server.app, clientOrigin: TEST_ORIGIN })
  const controller = new AbortController()
  vi.stubGlobal('WebSocket', Socket)
  try {
    const client = createEnvironmentClient({ origin: server.origin })
    connectTerminalSocket(
      { worktreeId: TEST_WORKTREE_ID, terminalId: 'main' },
      client,
      controller.signal,
    )
    connectLanguageServerSocket(
      { path: 'main.ts', rootPath: '../outside', serverId: 'typescript' },
      client,
      controller.signal,
    )
    await Promise.all(Socket.opened.map((socket) => socket.opening))
    expect(Socket.opened.map((socket) => socket.closeDetails)).toEqual([
      { code: 1008, reason: 'invalid-root' },
      { code: 1008, reason: 'invalid-root' },
    ])
  } finally {
    controller.abort()
    vi.unstubAllGlobals()
  }
})
