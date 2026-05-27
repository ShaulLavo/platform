import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, mock } from 'bun:test'

import { createAuthConfig } from '../auth'
import { createWorkspacePaths } from '../fs/path'

const TRUSTED_ORIGIN = 'http://localhost:5173'
const roots: string[] = []
const createdSessions: FakeLspProxySession[] = []
let matchedRoot = ''

class FakeLspProxySession {
  disposed = false
  readonly clientMessages: unknown[] = []

  async handleClientMessage(message: string | ArrayBuffer | Uint8Array) {
    this.clientMessages.push(JSON.parse(message.toString()) as unknown)
  }

  dispose() {
    this.disposed = true
  }
}

mock.module('./registry', () => ({
  matchLspServer: async () => {
    await Bun.sleep(25)
    return {
      root: matchedRoot,
      server: { id: 'buffered-lsp' },
    }
  },
}))

mock.module('./proxy-session', () => ({
  LspProxySession: {
    create: async () => {
      await Bun.sleep(25)
      const session = new FakeLspProxySession()
      createdSessions.push(session)
      return session
    },
  },
}))

const { lspRoutes } = await import('./routes')

afterEach(async () => {
  matchedRoot = ''
  createdSessions.length = 0
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('LSP websocket routes', () => {
  it('buffers client messages while the server session is opening', async () => {
    const root = await fixtureRoot()
    matchedRoot = root
    const routes = lspRoutes({ paths: createWorkspacePaths(root) }, auth())
    const ws = fakeSocket({
      path: 'src/file.fake',
      root: '',
      server: 'buffered-lsp',
    })
    const opening = routes.open(ws)

    routes.message(ws, JSON.stringify(initializeRequest(1)))
    await opening

    expect(createdSessions[0]?.clientMessages).toEqual([initializeRequest(1)])
  })
})

async function fixtureRoot() {
  const root = await mkdtemp(path.join(tmpdir(), 'platform-lsp-route-'))
  roots.push(root)
  return root
}

function auth() {
  return createAuthConfig({ allowedOrigins: [TRUSTED_ORIGIN] })
}

function fakeSocket(query: { path: string; root: string; server: string }) {
  const raw = {}
  return {
    closed: false,
    data: {
      headers: { origin: TRUSTED_ORIGIN },
      query,
    },
    raw,
    close() {
      this.closed = true
    },
    send: () => undefined,
  }
}

function initializeRequest(id: number) {
  return {
    id,
    jsonrpc: '2.0',
    method: 'initialize',
    params: {},
  }
}
