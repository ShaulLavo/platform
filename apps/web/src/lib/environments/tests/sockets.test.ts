import { TEST_WORKTREE_ID } from '../../../../test/factories/chat'
import { vi } from 'vitest'

import { createEnvironmentClient } from '@workspace/client-core/transport/client'
import {
  environmentActivitySignal,
  resumeEnvironmentActivity,
  suspendEnvironmentActivity,
} from '@/lib/environments/state/activity'
import { connectTerminalSocket, languageServerWebSocketConstructor } from '@/lib/server-sockets'
import { RecordingServerSocket } from '../../../../test/factories/server-socket'
import { expect, test } from '../../../../test/fixtures'

test('terminal socket adapters send binary views without Eden JSON encoding and receive array buffers', () => {
  vi.stubGlobal('WebSocket', RecordingServerSocket)
  RecordingServerSocket.opened.length = 0
  const controller = new AbortController()
  try {
    const client = createEnvironmentClient({ origin: 'http://localhost:37211' })
    const terminal = connectTerminalSocket(
      { worktreeId: TEST_WORKTREE_ID, terminalId: 'main' },
      client,
      controller.signal,
    )
    const socket = RecordingServerSocket.opened[0]
    if (!socket) throw new TypeError('The terminal adapter did not create its WebSocket.')
    expect(socket.binaryType).toBe('arraybuffer')
    const bytes = new Uint8Array([42, 0, 255, 226, 130, 27, 42]).subarray(1, -1)
    terminal.send(bytes)
    terminal.send('{"type":"resize","cols":80,"rows":24}')
    expect(socket.sent).toEqual([bytes, '{"type":"resize","cols":80,"rows":24}'])
    const received: unknown[] = []
    terminal.addEventListener('message', (event) => {
      if (event instanceof MessageEvent) received.push(event.data)
    })
    const frame = bytes.slice().buffer
    socket.dispatchEvent(new MessageEvent('message', { data: frame }))
    expect(received).toEqual([frame])
  } finally {
    controller.abort()
    vi.unstubAllGlobals()
  }
})

test('same-path terminal and LSP sockets retain their owner and close before activation', () => {
  const originA = 'http://localhost:37211'
  const originB = 'http://localhost:37212'
  vi.stubGlobal('WebSocket', RecordingServerSocket)
  RecordingServerSocket.opened.length = 0
  resumeEnvironmentActivity(originA)
  resumeEnvironmentActivity(originB)
  const signalA = environmentActivitySignal(originA)
  const signalB = environmentActivitySignal(originB)
  const clientA = createEnvironmentClient({ origin: originA })
  const clientB = createEnvironmentClient({ origin: originB })

  try {
    connectTerminalSocket({ worktreeId: TEST_WORKTREE_ID, terminalId: 'main' }, clientA, signalA)
    const LspA = languageServerWebSocketConstructor(clientA, signalA)
    new LspA('ws://localhost/lsp?root=/same-root&path=main.ts&server=typescript')
    const old = RecordingServerSocket.opened.slice()
    expect(old).toHaveLength(2)
    expect(old.map((socket) => new URL(socket.url).origin)).toEqual([
      'ws://localhost:37211',
      'ws://localhost:37211',
    ])
    suspendEnvironmentActivity(originA)
    expect(old.every((socket) => socket.readyState === RecordingServerSocket.CLOSED)).toBe(true)
    expect(() => new LspA('ws://localhost/lsp?root=/same-root&path=main.ts')).toThrow()

    connectTerminalSocket({ worktreeId: TEST_WORKTREE_ID, terminalId: 'main' }, clientB, signalB)
    const LspB = languageServerWebSocketConstructor(clientB, signalB)
    new LspB('ws://localhost/lsp?root=/same-root&path=main.ts&server=typescript')
    const current = RecordingServerSocket.opened.slice(2)
    expect(current.map((socket) => new URL(socket.url).origin)).toEqual([
      'ws://localhost:37212',
      'ws://localhost:37212',
    ])
    expect(current.every((socket) => socket.readyState === RecordingServerSocket.OPEN)).toBe(true)
  } finally {
    suspendEnvironmentActivity(originA)
    suspendEnvironmentActivity(originB)
    vi.unstubAllGlobals()
  }
})
