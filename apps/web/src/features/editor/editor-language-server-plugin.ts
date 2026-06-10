import type {
  LanguageServerDiagnosticSummary,
  LanguageServerDefinitionTarget,
  LanguageServerPlugin,
  LanguageServerReferencesResult,
  LanguageServerStatus,
} from '@singapor/lsp-plugin'
import { createLanguageServerPlugin } from '@singapor/lsp-plugin/websocket'

import type { EditorLanguageServerStatusSource } from '@/features/editor/state/editor-language-server-status-source'
import { serverUrl } from '@/lib/client'
import { EdenLanguageServerWebSocket } from '@/lib/server-sockets'

type MatchedLanguageServerPluginOptions = {
  enabled: boolean
  filePath: string
  match: LanguageServerMatch | null
  rootPath: string
  statusSource: EditorLanguageServerStatusSource
  onOpenDefinition?: (target: LanguageServerDefinitionTarget) => void | boolean
  onOpenReferences?: (result: LanguageServerReferencesResult) => void | boolean
}

export type LanguageServerMatch = {
  readonly root: string
  readonly serverId: string
}

export function createMatchedLanguageServerPlugin({
  enabled,
  filePath,
  match,
  rootPath,
  statusSource,
  onOpenDefinition,
  onOpenReferences,
}: MatchedLanguageServerPluginOptions): LanguageServerPlugin {
  if (!enabled || !match) return createIdleLanguageServerPlugin(statusSource)

  const readiness = createLanguageServerReadiness(statusSource)

  return createLanguageServerPlugin({
    rootUri: fileUriForPath(rootPath),
    webSocketRoute: languageServerRoute(rootPath, filePath, match.serverId),
    webSocketTransportOptions: {
      WebSocketCtor: EdenLanguageServerWebSocket,
    },
    onStatusChange: readiness.setStatus,
    onDiagnostics: readiness.setDiagnostics,
    onInteractiveReady: readiness.setInteractiveReady,
    onOpenDefinition,
    onOpenReferences,
    onError: () => statusSource.setStatus('error'),
  })
}

function createIdleLanguageServerPlugin(
  statusSource: EditorLanguageServerStatusSource,
): LanguageServerPlugin {
  return {
    name: 'editor.language-server.idle',
    activate: () => {
      statusSource.reset()
      return []
    },
  }
}

function createLanguageServerReadiness(statusSource: EditorLanguageServerStatusSource) {
  let connected = false
  let usable = false

  return {
    setStatus: (status: LanguageServerStatus) => {
      if (status === 'idle') {
        connected = false
        usable = false
        statusSource.reset()
        return
      }
      if (status === 'loading') {
        connected = false
        usable = false
        statusSource.setSnapshot({ diagnostics: null, status: 'loading' })
        return
      }
      if (status === 'ready') {
        connected = true
        statusSource.setStatus(usable ? 'ready' : 'loading')
        return
      }

      connected = false
      statusSource.setStatus(status)
    },
    setDiagnostics: (diagnostics: LanguageServerDiagnosticSummary) => {
      usable = true
      statusSource.setSnapshot({
        diagnostics,
        status: connected ? 'ready' : statusSource.getSnapshot().status,
      })
    },
    setInteractiveReady: () => {
      usable = true
      if (connected) statusSource.setStatus('ready')
    },
  }
}

function languageServerRoute(rootPath: string, filePath: string, serverId: string) {
  const url = new URL('/lsp', serverUrl)
  if (url.protocol === 'http:') url.protocol = 'ws:'
  if (url.protocol === 'https:') url.protocol = 'wss:'
  url.searchParams.set('root', rootPath)
  url.searchParams.set('path', filePath)
  url.searchParams.set('server', serverId)
  return url
}

function fileUriForPath(path: string) {
  const normalized = path.replace(/^\/+/, '')
  return `file:///${normalized.split('/').map(encodeURIComponent).join('/')}`
}

export function languageServerMatch(value: unknown): LanguageServerMatch | null {
  if (!value || typeof value !== 'object') return null

  const match = value as Record<string, unknown>
  if (typeof match.root !== 'string') return null
  if (typeof match.serverId !== 'string') return null

  return { root: match.root, serverId: match.serverId }
}
