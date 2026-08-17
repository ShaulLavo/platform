import type { LanguageServerDiagnosticSummary, LanguageServerStatus } from '@singapor/lsp-plugin'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  EditorLanguageServerStatusSnapshot,
  EditorLanguageServerStatusSource,
} from '@/features/editor/state/language-server-status-source'

type MockLanguageServerPluginOptions = {
  readonly onDiagnostics?: (summary: LanguageServerDiagnosticSummary) => void
  readonly onInteractiveReady?: () => void
  readonly onStatusChange?: (status: LanguageServerStatus) => void
  readonly rootUri?: string | null
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
