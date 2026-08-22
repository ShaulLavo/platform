import type {
  LanguageServerDiagnosticSummary,
  LanguageServerDefinitionTarget,
  LanguageServerPlugin,
  LanguageServerReferencesResult,
  LanguageServerStatus,
} from '@singapor/lsp-plugin'
import { createLanguageServerPlugin } from '@singapor/lsp-plugin/websocket'
import { LSP_SEMANTIC_TOKENS_REFRESH, LSP_SERVER_EXITED } from '@workspace/contracts'

import type { EditorLanguageServerStatusSource } from '@/features/editor/state/language-server-status-source'
import { SemanticTokenController } from '@/features/editor/state/semantic-token-controller'
import {
  LANGUAGE_SERVER_CLIENT_INFO,
  semanticTokensCapabilityForServer,
} from '@/features/editor/utils/semantic-token-capability'
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
  const semanticTokens = new SemanticTokenController({ serverId: match.serverId })

  return createLanguageServerPlugin({
    // A pure function of the server id, and nothing else — see the builder for
    // why the pooled backend makes that a requirement rather than a preference.
    capabilities: semanticTokensCapabilityForServer(match.serverId),
    clientInfo: LANGUAGE_SERVER_CLIENT_INFO,
    notificationHandlers: {
      [LSP_SEMANTIC_TOKENS_REFRESH]: () => {
        semanticTokens.handleRefresh()
        return true
      },
      [LSP_SERVER_EXITED]: () => {
        // The proxy saying the backend is gone, on the socket that is closing
        // behind it. Without this the transport clears its handlers silently and
        // the indicator keeps reading `'ready'` over a dead server.
        statusSource.setStatus('error')
        return true
      },
    },
    rootUri: fileUriForPath(rootPath),
    semanticTokens: {
      onLayer: (layer, document) => {
        semanticTokens.attachLayer(layer, document)
      },
      onRangeNeeded: (request) => semanticTokens.handleRangeNeeded(request),
      onResyncRequired: (reason) => semanticTokens.handleResyncRequired(reason),
      scopeAliases: semanticTokens.scopeAliases,
      // Explicitly zero rather than left unset. The layer's delay has no default
      // and unset already means zero, but writing it here is what keeps a later
      // editor default — or a changed meaning for *unset* — from quietly adding a
      // second debounce underneath the three this repo costed.
      viewportDelayMs: 0,
    },
    webSocketRoute: languageServerRoute(rootPath, filePath, match.serverId),
    webSocketTransportOptions: {
      WebSocketCtor: EdenLanguageServerWebSocket,
    },
    onConnectionCreated: (context) => {
      semanticTokens.attachConnection(context)

      return { dispose: () => semanticTokens.detachConnection() }
    },
    // The same context again once `initialize` has answered. The first demand
    // almost always arrives before that, and the layer never repeats a question,
    // so without this hook a freshly opened file stays uncoloured until it is
    // scrolled or typed into.
    onConnected: () => semanticTokens.handleConnected(),
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
