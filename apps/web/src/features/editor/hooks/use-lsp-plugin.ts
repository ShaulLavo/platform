import type {
  LanguageServerDefinitionTarget,
  LanguageServerDiagnosticSummary,
  LanguageServerPlugin,
  LanguageServerReferencesResult,
  LanguageServerStatus,
} from '@editor/language-server'
import { createLanguageServerPlugin } from '@editor/language-server/websocket'
import { useEffect, useMemo, useState } from 'react'

import { client, serverUrl } from '@/lib/client'
import { EdenLanguageServerWebSocket } from '@/lib/server-sockets'

type UseLanguageServerPluginOptions = {
  enabled?: boolean
  filePath: string
  rootPath: string
  onOpenDefinition?: (target: LanguageServerDefinitionTarget) => void | boolean
  onOpenReferences?: (result: LanguageServerReferencesResult) => void | boolean
}

export function useLanguageServerPlugin({
  enabled = true,
  filePath,
  rootPath,
  onOpenDefinition,
  onOpenReferences,
}: UseLanguageServerPluginOptions) {
  const [languageServerStatus, setLanguageServerStatus] = useState<LanguageServerStatus>('idle')
  const [languageServerDiagnostics, setLanguageServerDiagnostics] =
    useState<LanguageServerDiagnosticSummary | null>(null)
  const matchKey = languageServerMatchKey(rootPath, filePath)
  const [matchState, setMatchState] = useState<LanguageServerMatchState | null>(null)
  const match = enabled && matchState?.key === matchKey ? matchState.match : null

  useEffect(() => {
    if (!enabled) return

    const controller = new AbortController()
    client.lsp.match
      .get({
        query: { path: filePath, root: rootPath },
        fetch: { signal: controller.signal },
      })
      .then((response) => {
        if (!controller.signal.aborted) {
          setMatchState({
            key: matchKey,
            match: response.error ? null : languageServerMatch(response.data),
          })
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setMatchState({ key: matchKey, match: null })
        }
      })

    return () => controller.abort()
  }, [enabled, filePath, matchKey, rootPath])

  const languageServer = useMemo(() => {
    if (!match) return idleLanguageServerPlugin

    return createLanguageServerPlugin({
      rootUri: fileUriForPath(rootPath),
      webSocketRoute: languageServerRoute(rootPath, filePath, match.serverId),
      webSocketTransportOptions: {
        WebSocketCtor: EdenLanguageServerWebSocket,
      },
      onStatusChange: setLanguageServerStatus,
      onDiagnostics: setLanguageServerDiagnostics,
      onOpenDefinition,
      onOpenReferences,
      onError: () => undefined,
    })
  }, [filePath, match, onOpenDefinition, onOpenReferences, rootPath])

  return {
    languageServerDiagnostics: match ? languageServerDiagnostics : null,
    languageServer,
    languageServerStatus: match ? languageServerStatus : 'idle',
  }
}

type LanguageServerMatch = {
  readonly root: string
  readonly serverId: string
}

type LanguageServerMatchState = {
  readonly key: string
  readonly match: LanguageServerMatch | null
}

const idleLanguageServerPlugin: LanguageServerPlugin = {
  name: 'editor.language-server.idle',
  activate: () => [],
}

function languageServerMatchKey(rootPath: string, filePath: string) {
  return `${rootPath}\u0000${filePath}`
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

function languageServerMatch(value: unknown): LanguageServerMatch | null {
  if (!value || typeof value !== 'object') return null

  const match = value as Record<string, unknown>
  if (typeof match.root !== 'string') return null
  if (typeof match.serverId !== 'string') return null

  return { root: match.root, serverId: match.serverId }
}
