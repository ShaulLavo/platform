import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'bun:test'

import { createAuthConfig } from '../auth'
import { createWorkspacePaths } from '../fs/path'
import { lspRoutes, type LspRouteDeps } from './routes'

const TRUSTED_ORIGIN = 'http://localhost:5173'
const roots: string[] = []

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

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('LSP websocket routes', () => {
  it('buffers client messages while the server session is opening', async () => {
    const root = await fixtureRoot()
    const createdSessions: FakeLspProxySession[] = []
    const routes = lspRoutes(
      { paths: createWorkspacePaths(root) },
      auth(),
      bufferedLspDeps(root, createdSessions),
    )
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

// Inject fakes through lspRoutes' deps instead of mocking modules — Bun module
// mocks are global and would leak the fake registry into other test files.
function bufferedLspDeps(root: string, createdSessions: FakeLspProxySession[]): LspRouteDeps {
  return {
    matchServer: (async () => {
      await Bun.sleep(25)
      return { root, server: { id: 'buffered-lsp' } }
    }) as unknown as LspRouteDeps['matchServer'],
    createSession: (async () => {
      await Bun.sleep(25)
      const session = new FakeLspProxySession()
      createdSessions.push(session)
      return session
    }) as unknown as LspRouteDeps['createSession'],
  }
}

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
