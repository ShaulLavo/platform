import { beforeEach, describe, expect, it, mock } from 'bun:test'

import type { EditorLanguageServerStatusSource } from '@/features/editor/state/editor-language-server-status-source'

type MockLanguageServerPluginOptions = {
  readonly rootUri?: string | null
  readonly webSocketRoute: string | URL
}

const createdLanguageServerPlugins: MockLanguageServerPluginOptions[] = []

mock.module('@editor/language-server/websocket', () => ({
  createLanguageServerPlugin: (options: MockLanguageServerPluginOptions) => {
    createdLanguageServerPlugins.push(options)
    return {
      name: 'editor.language-server',
      activate: () => [],
    }
  },
}))

mock.module('@/lib/client', () => ({
  serverUrl: 'http://localhost:3001',
}))

mock.module('@/lib/server-sockets', () => ({
  EdenLanguageServerWebSocket: class EdenLanguageServerWebSocket {},
}))

const { createMatchedLanguageServerPlugin, languageServerMatch } =
  await import('./editor-language-server-plugin')

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
}

function statusSource(): TestStatusSource {
  let resetCount = 0
  return {
    getSnapshot: () => ({ diagnostics: null, status: 'idle' }),
    get resetCount() {
      return resetCount
    },
    reset: () => {
      resetCount += 1
    },
    setDiagnostics: () => undefined,
    setSnapshot: () => undefined,
    setStatus: () => undefined,
    subscribe: () => () => undefined,
  }
}
