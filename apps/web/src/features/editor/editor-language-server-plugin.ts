import type { EditorDisposable, EditorPlugin, EditorPluginContext } from '@editor/core'
import type {
  LanguageServerDefinitionTarget,
  LanguageServerPlugin,
  LanguageServerReferencesResult,
} from '@editor/language-server'
import { createLanguageServerPlugin } from '@editor/language-server/websocket'

import type { EditorLanguageServerStatusSource } from '@/features/editor/state/editor-language-server-status-source'
import { client, serverUrl } from '@/lib/client'
import { EdenLanguageServerWebSocket } from '@/lib/server-sockets'

type MatchedLanguageServerPluginOptions = {
  enabled: boolean
  filePath: string
  rootPath: string
  statusSource: EditorLanguageServerStatusSource
  onOpenDefinition?: (target: LanguageServerDefinitionTarget) => void | boolean
  onOpenReferences?: (result: LanguageServerReferencesResult) => void | boolean
}

type LanguageServerMatch = {
  readonly root: string
  readonly serverId: string
}

export function createMatchedLanguageServerPlugin({
  enabled,
  filePath,
  rootPath,
  statusSource,
  onOpenDefinition,
  onOpenReferences,
}: MatchedLanguageServerPluginOptions): LanguageServerPlugin {
  return {
    name: 'platform.language-server.match',
    activate: (context) => {
      if (!enabled) {
        statusSource.reset()
        return []
      }

      let disposed = false
      let languageServerDisposable: EditorDisposable | null = null
      const abortController = new AbortController()
      statusSource.reset()

      client.lsp.match
        .get({
          query: { path: filePath, root: rootPath },
          fetch: { signal: abortController.signal },
        })
        .then((response) => {
          if (disposed || abortController.signal.aborted) return

          languageServerDisposable = activateMatchedLanguageServerPlugin(context, response, {
            filePath,
            rootPath,
            statusSource,
            onOpenDefinition,
            onOpenReferences,
          })
        })
        .catch(() => {
          if (disposed || abortController.signal.aborted) return

          statusSource.reset()
        })

      return {
        dispose: () => {
          disposed = true
          abortController.abort()
          languageServerDisposable?.dispose()
          statusSource.reset()
        },
      }
    },
  }
}

function activateMatchedLanguageServerPlugin(
  context: EditorPluginContext,
  response: Awaited<ReturnType<typeof client.lsp.match.get>>,
  options: Omit<MatchedLanguageServerPluginOptions, 'enabled'>,
): EditorDisposable | null {
  const match = response.error ? null : languageServerMatch(response.data)
  if (!match) {
    options.statusSource.reset()
    return null
  }

  return activateLanguageServerPlugin(
    context,
    createLanguageServerPlugin({
      rootUri: fileUriForPath(options.rootPath),
      webSocketRoute: languageServerRoute(options.rootPath, options.filePath, match.serverId),
      webSocketTransportOptions: {
        WebSocketCtor: EdenLanguageServerWebSocket,
      },
      onStatusChange: options.statusSource.setStatus,
      onDiagnostics: options.statusSource.setDiagnostics,
      onOpenDefinition: options.onOpenDefinition,
      onOpenReferences: options.onOpenReferences,
      onError: () => options.statusSource.setStatus('error'),
    }),
    options.statusSource,
  )
}

function activateLanguageServerPlugin(
  context: EditorPluginContext,
  plugin: LanguageServerPlugin,
  statusSource: EditorLanguageServerStatusSource,
): EditorDisposable {
  try {
    return disposableFromActivationResult(plugin.activate(context))
  } catch {
    statusSource.setStatus('error')
    return emptyDisposable
  }
}

function disposableFromActivationResult(
  result: ReturnType<EditorPlugin['activate']>,
): EditorDisposable {
  if (!result) return emptyDisposable
  if (Array.isArray(result)) {
    return {
      dispose: () => {
        for (const disposable of result) disposable.dispose()
      },
    }
  }

  return result
}

const emptyDisposable: EditorDisposable = {
  dispose: () => undefined,
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
