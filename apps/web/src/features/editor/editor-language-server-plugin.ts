import type {
  LanguageServerDefinitionTarget,
  LanguageServerPlugin,
  LanguageServerReferencesResult,
} from '@editor/language-server'
import { createLanguageServerPlugin } from '@editor/language-server/websocket'

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

  return createLanguageServerPlugin({
    rootUri: fileUriForPath(rootPath),
    webSocketRoute: languageServerRoute(rootPath, filePath, match.serverId),
    webSocketTransportOptions: {
      WebSocketCtor: EdenLanguageServerWebSocket,
    },
    onStatusChange: statusSource.setStatus,
    onDiagnostics: statusSource.setDiagnostics,
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
