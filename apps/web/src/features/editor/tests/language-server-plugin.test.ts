import type { LanguageServerDiagnosticSummary, LanguageServerStatus } from '@singapor/lsp-plugin'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  EditorLanguageServerStatusSnapshot,
  EditorLanguageServerStatusSource,
} from '@/features/editor/state/language-server-status-source'

type MockLanguageServerPluginOptions = {
  readonly capabilities?: Record<string, unknown>
  readonly clientInfo?: { name: string }
  readonly notificationHandlers?: Record<string, (...args: never[]) => unknown>
  readonly onDiagnostics?: (summary: LanguageServerDiagnosticSummary) => void
  readonly onInteractiveReady?: () => void
  readonly onStatusChange?: (status: LanguageServerStatus) => void
  readonly rootUri?: string | null
  readonly semanticTokens?: {
    readonly scopeAliases?: Readonly<Record<string, string>>
    readonly viewportDelayMs?: number
  }
  readonly webSocketRoute: string | URL
}

const { createdLanguageServerPlugins } = vi.hoisted(() => ({
  createdLanguageServerPlugins: [] as MockLanguageServerPluginOptions[],
}))

vi.mock('@singapor/lsp-plugin/websocket', () => ({
  createLanguageServerPlugin: (options: MockLanguageServerPluginOptions) => {
    createdLanguageServerPlugins.push(options)
    return {
      activate: () => [],
      name: 'editor.language-server',
    }
  },
}))

vi.mock('@/lib/server-sockets', () => ({
  EdenLanguageServerWebSocket: class EdenLanguageServerWebSocket {},
}))

const { createMatchedLanguageServerPlugin, languageServerMatch } =
  await import('@/features/editor/utils/language-server-plugin')

beforeEach(() => {
  createdLanguageServerPlugins.length = 0
})

describe('createMatchedLanguageServerPlugin', () => {
  it('stays idle while a language server match is unavailable', () => {
    const source = statusSource()
    const plugin = createMatchedLanguageServerPlugin({
      enabled: true,
      filePath: '/repo/src/a.ts',
      match: null,
      rootPath: '/repo',
      statusSource: source,
    })

    plugin.activate({} as never)

    expect(source.resetCount).toBe(1)
    expect(plugin.name).toBe('editor.language-server.idle')
  })

  it('creates the real language server plugin when a match is available', () => {
    const plugin = createMatchedLanguageServerPlugin({
      enabled: true,
      filePath: '/repo/src/a.ts',
      match: { root: '/repo', serverId: 'typescript' },
      rootPath: '/repo',
      statusSource: statusSource(),
    })

    expect(plugin.name).toBe('editor.language-server')
    expect(createdLanguageServerPlugins).toHaveLength(1)

    const options = createdLanguageServerPlugins[0]
    const route = new URL(options.webSocketRoute)

    expect(options.rootUri).toBe('file:///repo')
    expect(route.protocol).toBe('ws:')
    expect(route.pathname).toBe('/lsp')
    expect(route.searchParams.get('root')).toBe('/repo')
    expect(route.searchParams.get('path')).toBe('/repo/src/a.ts')
    expect(route.searchParams.get('server')).toBe('typescript')
  })

  it('keeps status loading until the document is usable', () => {
    const source = statusSource()
    createMatchedLanguageServerPlugin({
      enabled: true,
      filePath: '/repo/src/a.ts',
      match: { root: '/repo', serverId: 'typescript' },
      rootPath: '/repo',
      statusSource: source,
    })

    const options = createdLanguageServerPlugins[0]
    options.onStatusChange?.('loading')
    options.onStatusChange?.('ready')

    expect(source.snapshot.status).toBe('loading')

    options.onInteractiveReady?.()

    expect(source.snapshot.status).toBe('ready')
  })

  it('also marks ready when diagnostics arrive first', () => {
    const source = statusSource()
    createMatchedLanguageServerPlugin({
      enabled: true,
      filePath: '/repo/src/a.ts',
      match: { root: '/repo', serverId: 'typescript' },
      rootPath: '/repo',
      statusSource: source,
    })

    const options = createdLanguageServerPlugins[0]
    options.onStatusChange?.('loading')
    options.onStatusChange?.('ready')

    expect(source.snapshot.status).toBe('loading')

    options.onDiagnostics?.(diagnosticSummary('/repo/src/a.ts'))

    expect(source.snapshot.status).toBe('ready')
  })
})

/**
 * The invariant the whole pooling argument rests on.
 *
 * `initialize` is sent once per pooled backend and its result is replayed to
 * every client that connects after, so the legend a root sees is the one
 * negotiated by whichever tab opened first. At least two servers compute their
 * advertised legend *from* the declared block. If the block varied by document,
 * root or viewport, a root's colour would depend on which file someone opened
 * first — an ordering bug with no symptom anyone could trace.
 */
describe('semantic token capabilities', () => {
  const SERVER_IDS = ['rust', 'gopls', 'clangd', 'zls', 'terraform', 'typescript', 'unknown-server']

  it('builds a byte-identical block for one server across documents and roots', () => {
    for (const serverId of SERVER_IDS) {
      createdLanguageServerPlugins.length = 0
      createMatchedLanguageServerPlugin({
        enabled: true,
        filePath: '/repo/src/a.ts',
        match: { root: '/repo', serverId },
        rootPath: '/repo',
        statusSource: statusSource(),
      })
      createMatchedLanguageServerPlugin({
        enabled: true,
        filePath: '/other/deeply/nested/b.rs',
        match: { root: '/other', serverId },
        rootPath: '/other',
        statusSource: statusSource(),
      })

      const [first, second] = createdLanguageServerPlugins
      expect(JSON.stringify(first?.capabilities)).toBe(JSON.stringify(second?.capabilities))
      expect(first?.capabilities).toBeDefined()
    }
  })

  it('varies the block between servers, or the per-server table does nothing', () => {
    const blocks = SERVER_IDS.map((serverId) => {
      createdLanguageServerPlugins.length = 0
      createMatchedLanguageServerPlugin({
        enabled: true,
        filePath: '/repo/src/a.ts',
        match: { root: '/repo', serverId },
        rootPath: '/repo',
        statusSource: statusSource(),
      })
      return JSON.stringify(createdLanguageServerPlugins[0]?.capabilities)
    })

    expect(new Set(blocks).size).toBeGreaterThan(1)
  })

  /**
   * Absences, not `false` values. An undeclared capability is what the wire
   * means by "no", and a key present with `false` is a different statement that
   * some servers branch on separately.
   */
  it('declares none of the three flags this client cannot honour', () => {
    createMatchedLanguageServerPlugin({
      enabled: true,
      filePath: '/repo/src/a.rs',
      match: { root: '/repo', serverId: 'rust' },
      rootPath: '/repo',
      statusSource: statusSource(),
    })

    const block = createdLanguageServerPlugins[0]?.capabilities as {
      textDocument?: { semanticTokens?: Record<string, unknown> }
    }
    const semanticTokens = block?.textDocument?.semanticTokens
    expect(semanticTokens).toBeDefined()
    expect(semanticTokens).not.toHaveProperty('multilineTokenSupport')
    expect(semanticTokens).not.toHaveProperty('overlappingTokenSupport')
    expect(semanticTokens).not.toHaveProperty('dynamicRegistration')
    expect(semanticTokens).toHaveProperty('augmentsSyntaxTokens')
  })

  /**
   * Without this the refresh route does not exist. A conformant server only
   * sends `workspace/semanticTokens/refresh` to a client that declared it, and
   * the editor's builder emits a `textDocument` block only — so the proxy's
   * downgrade and the handler behind it would be waiting for a request nobody
   * would ever send.
   */
  it('declares refresh support, which is what makes the refresh route reachable', () => {
    createMatchedLanguageServerPlugin({
      enabled: true,
      filePath: '/repo/src/a.rs',
      match: { root: '/repo', serverId: 'rust' },
      rootPath: '/repo',
      statusSource: statusSource(),
    })

    const block = createdLanguageServerPlugins[0]?.capabilities as {
      workspace?: { semanticTokens?: { refreshSupport?: boolean } }
    }
    expect(block?.workspace?.semanticTokens?.refreshSupport).toBe(true)
  })

  /** Values, not just presence: the per-server table is what these come from. */
  it("declares each server's own measured request set", () => {
    const requestsFor = (serverId: string) => {
      createdLanguageServerPlugins.length = 0
      createMatchedLanguageServerPlugin({
        enabled: true,
        filePath: '/repo/src/a',
        match: { root: '/repo', serverId },
        rootPath: '/repo',
        statusSource: statusSource(),
      })
      const block = createdLanguageServerPlugins[0]?.capabilities as {
        textDocument?: { semanticTokens?: { requests?: unknown } }
      }
      return block?.textDocument?.semanticTokens?.requests
    }

    // Measured: rust-analyzer answers deltas and ranges; gopls answers ranges and
    // refuses deltas; clangd answers deltas and refuses ranges outright.
    expect(requestsFor('rust')).toEqual({ full: { delta: true }, range: true })
    expect(requestsFor('gopls')).toEqual({ full: { delta: false }, range: true })
    expect(requestsFor('clangd')).toEqual({ full: { delta: true }, range: false })
  })

  it('answers augmentsSyntaxTokens per server, which is the whole reason it is host data', () => {
    const augmentsFor = (serverId: string) => {
      createdLanguageServerPlugins.length = 0
      createMatchedLanguageServerPlugin({
        enabled: true,
        filePath: '/repo/src/a',
        match: { root: '/repo', serverId },
        rootPath: '/repo',
        statusSource: statusSource(),
      })
      const block = createdLanguageServerPlugins[0]?.capabilities as {
        textDocument?: { semanticTokens?: { augmentsSyntaxTokens?: boolean } }
      }
      return block?.textDocument?.semanticTokens?.augmentsSyntaxTokens
    }

    // zig has a grammar registered here, but zls's tokens are the whole rendering
    // of the identifiers in it — there is nothing to augment.
    expect(augmentsFor('zls')).toBe(false)
    expect(augmentsFor('rust')).toBe(true)
  })

  /** `zls` turns `full` off for either of these two names. */
  it('never calls itself a name zls refuses to answer', () => {
    createMatchedLanguageServerPlugin({
      enabled: true,
      filePath: '/repo/main.zig',
      match: { root: '/repo', serverId: 'zls' },
      rootPath: '/repo',
      statusSource: statusSource(),
    })

    const name = createdLanguageServerPlugins[0]?.clientInfo?.name
    expect(name).toBeTruthy()
    expect(name).not.toBe('Visual Studio Code')
    expect(name).not.toBe('Code - OSS')
  })

  /**
   * The editor's demand signal has no default delay and this repo's controller
   * owns all three numbers on the path. Written down rather than inherited: a
   * later editor default underneath them would be a latency neither document
   * budgets.
   */
  it('leaves the editor with no delay of its own on the demand signal', () => {
    createMatchedLanguageServerPlugin({
      enabled: true,
      filePath: '/repo/src/a.rs',
      match: { root: '/repo', serverId: 'rust' },
      rootPath: '/repo',
      statusSource: statusSource(),
    })

    expect(createdLanguageServerPlugins[0]?.semanticTokens?.viewportDelayMs).toBe(0)
  })

  it("hands the layer the matched server's alias table", () => {
    createMatchedLanguageServerPlugin({
      enabled: true,
      filePath: '/repo/src/a.rs',
      match: { root: '/repo', serverId: 'rust' },
      rootPath: '/repo',
      statusSource: statusSource(),
    })

    expect(createdLanguageServerPlugins[0]?.semanticTokens?.scopeAliases).toMatchObject({
      lifetime: 'typeParameter',
      selfKeyword: 'keyword',
    })
  })

  it('registers a handler for both proxy-only notifications', () => {
    createMatchedLanguageServerPlugin({
      enabled: true,
      filePath: '/repo/src/a.rs',
      match: { root: '/repo', serverId: 'rust' },
      rootPath: '/repo',
      statusSource: statusSource(),
    })

    const handlers = createdLanguageServerPlugins[0]?.notificationHandlers ?? {}
    expect(Object.keys(handlers)).toEqual(
      expect.arrayContaining(['workspace/semanticTokens/refresh', '$/platform/serverExited']),
    )
  })

  it('reports an error status when the proxy says the backend exited', () => {
    const source = statusSource()
    createMatchedLanguageServerPlugin({
      enabled: true,
      filePath: '/repo/src/a.rs',
      match: { root: '/repo', serverId: 'rust' },
      rootPath: '/repo',
      statusSource: source,
    })

    source.setStatus('ready')
    createdLanguageServerPlugins[0]?.notificationHandlers?.['$/platform/serverExited']?.()

    // The status lie: without this the socket closes silently and the indicator
    // keeps reading `ready` over a server that is gone.
    expect(source.snapshot.status).toBe('error')
  })
})

describe('languageServerMatch', () => {
  it('normalizes valid match responses', () => {
    expect(languageServerMatch({ root: '/repo', serverId: 'typescript' })).toEqual({
      root: '/repo',
      serverId: 'typescript',
    })
  })

  it('rejects invalid match responses', () => {
    expect(languageServerMatch(null)).toBeNull()
    expect(languageServerMatch({ root: '/repo' })).toBeNull()
    expect(languageServerMatch({ root: 1, serverId: 'typescript' })).toBeNull()
  })
})

type TestStatusSource = EditorLanguageServerStatusSource & {
  readonly resetCount: number
  readonly snapshot: EditorLanguageServerStatusSnapshot
}

function statusSource(): TestStatusSource {
  let resetCount = 0
  let snapshot: EditorLanguageServerStatusSnapshot = { diagnostics: null, status: 'idle' }
  return {
    getSnapshot: () => snapshot,
    reset: () => {
      resetCount += 1
      snapshot = { diagnostics: null, status: 'idle' }
    },
    get resetCount() {
      return resetCount
    },
    setDiagnostics: (diagnostics) => {
      snapshot = { ...snapshot, diagnostics }
    },
    setSnapshot: (next) => {
      snapshot = next
    },
    setStatus: (status) => {
      snapshot = { ...snapshot, status }
    },
    get snapshot() {
      return snapshot
    },
    subscribe: () => () => undefined,
  }
}

function diagnosticSummary(uri: string): LanguageServerDiagnosticSummary {
  return {
    counts: {
      error: 0,
      hint: 0,
      information: 0,
      total: 0,
      warning: 0,
    },
    diagnostics: [],
    uri,
    version: 1,
  }
}
