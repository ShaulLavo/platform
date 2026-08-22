import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createAuthConfig } from '../../auth'
import { createWorkspacePaths } from '../../fs/path'
import { lspRouteMatch, lspRouteSemanticTokens, lspRoutes, type LspRouteDeps } from '../routes'

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

  it('rejects an unknown explicit server without acquiring a backend', async () => {
    const root = await fixtureRoot()
    const acquire = vi.fn()
    const routes = lspRoutes({ paths: createWorkspacePaths(root) }, auth(), {
      resolveServer: async () => null,
      settings: () => ({ servers: {}, tyForPython: false }),
      pool: { acquire },
    })
    const ws = fakeSocket({ path: 'src/file.fake', root: '', server: 'unknown' })

    await routes.open(ws)

    expect(ws.closed).toBe(true)
    expect(acquire).not.toHaveBeenCalled()
  })
})

describe('LSP match route', () => {
  it('returns every descriptor with its independently resolved root', async () => {
    const root = await fixtureRoot()
    await Bun.write(path.join(root, 'package.json'), '{}')
    await mkdir(path.join(root, 'nested'))
    await Bun.write(path.join(root, 'nested', 'deno.json'), '{}')
    await Bun.write(path.join(root, 'nested', 'file.ts'), 'export const value = 1\n')

    const result = await lspRouteMatch(
      createWorkspacePaths(root),
      { path: 'nested/file.ts', root: '' },
      { servers: {}, tyForPython: false },
    )

    expect(result.map((match) => match.serverId)).toEqual(['deno', 'eslint', 'oxlint', 'biome'])
    expect(result[0]?.root).toBe(path.join(root, 'nested'))
    expect(result.slice(1).every((match) => match.root === root)).toBe(true)
    expect(result[0]?.features.completion).toBe(0)
    expect(result[1]?.features.diagnostics).toBe(0)
  })
})

// Inject fakes through lspRoutes' deps instead of mocking modules — Bun module
// mocks are global and would leak the fake registry into other test files.
function bufferedLspDeps(root: string, createdSessions: FakeLspProxySession[]): LspRouteDeps {
  return {
    resolveServer: (async () => {
      await Bun.sleep(25)
      return { root, server: { id: 'buffered-lsp' } }
    }) as unknown as LspRouteDeps['resolveServer'],
    settings: () => ({ servers: {}, tyForPython: false }),
    pool: {
      acquire: async () => {
        await Bun.sleep(25)
        const session = new FakeLspProxySession()
        createdSessions.push(session)
        return session
      },
    },
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

/**
 * What a developer reads to find out why a language is uncoloured.
 *
 * Every per-server fact this app relies on came out of one version of one
 * binary, and the negotiated result is the only thing that reports the truth
 * after a server upgrade. It deliberately reports `null` rather than spawning:
 * this endpoint is asked before the websocket opens, and starting a language
 * server to answer a question about language servers would be worse than saying
 * "not yet".
 */
describe('negotiated semantic tokens', () => {
  it('reports what a live backend agreed to', async () => {
    const root = await fixtureRoot()
    await Bun.write(path.join(root, 'main.go'), 'package main\n')
    await Bun.write(path.join(root, 'go.mod'), 'module probe\n')
    const negotiated = {
      delta: false,
      full: true,
      legend: { tokenModifiers: ['readonly'], tokenTypes: ['variable', 'type'] },
      range: true,
    }

    const result = await lspRouteSemanticTokens(
      createWorkspacePaths(root),
      { path: 'main.go', root: '' },
      { servers: {}, tyForPython: false },
      { negotiatedSemanticTokens: () => negotiated },
    )

    expect(result).toMatchObject({ negotiated, serverId: 'gopls' })
  })

  it('says so rather than spawning when no backend has initialized', async () => {
    const root = await fixtureRoot()
    await Bun.write(path.join(root, 'main.go'), 'package main\n')
    await Bun.write(path.join(root, 'go.mod'), 'module probe\n')
    let asked = 0

    const result = await lspRouteSemanticTokens(
      createWorkspacePaths(root),
      { path: 'main.go', root: '' },
      { servers: {}, tyForPython: false },
      {
        negotiatedSemanticTokens: () => {
          asked += 1
          return null
        },
      },
    )

    expect(result).toMatchObject({ negotiated: null, serverId: 'gopls' })
    expect(asked).toBe(1)
  })

  it('answers null for a path no server claims', async () => {
    const root = await fixtureRoot()
    await Bun.write(path.join(root, 'notes.txt'), 'hello\n')

    const result = await lspRouteSemanticTokens(
      createWorkspacePaths(root),
      { path: 'notes.txt', root: '' },
      { servers: {}, tyForPython: false },
      { negotiatedSemanticTokens: () => null },
    )

    expect(result).toBeNull()
  })
})
