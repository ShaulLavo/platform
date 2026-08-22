import type {
  LanguageServerDefinitionTarget,
  LanguageServerFeatureRanks,
  LanguageServerLaneOptions,
  LanguageServerPlugin,
  LanguageServerReferencesResult,
  LspConnectionProvider,
} from '@singapor/lsp-plugin'
import { createLanguageServerSetPlugin } from '@singapor/lsp-plugin/websocket'
import {
  LSP_FEATURE_IDS,
  LSP_SEMANTIC_TOKENS_REFRESH,
  LSP_SERVER_EXITED,
  type LspFeatureId,
  type LspMatch,
} from '@workspace/contracts'

import { languageServerConnectionProvider } from '@/features/editor/state/language-server-connection-pool'
import type { EditorLanguageServerStatusSource } from '@/features/editor/state/language-server-status-source'
import { lspLanguageIdForPath } from '@/features/editor/utils/lsp-language-id'
import { SemanticTokenController } from '@/features/editor/state/semantic-token-controller'
import {
  LANGUAGE_SERVER_CLIENT_INFO,
  semanticTokensCapabilityForServer,
} from '@/features/editor/utils/semantic-token-capability'
import { serverUrl } from '@/lib/client'
import { EdenLanguageServerWebSocket } from '@/lib/server-sockets'

export type LanguageServerMatch = LspMatch

export type LanguageServerDocumentTarget = {
  readonly matchPath: string
  readonly disabledFeatures?: readonly LspFeatureId[]
  readonly sharedNotificationsByServer?: Readonly<
    Record<string, readonly { method: string; params: unknown }[]>
  >
}

type MatchedLanguageServerPluginOptions = {
  enabled: boolean
  matches: readonly LanguageServerMatch[] | null
  rootPath: string
  statusSource: EditorLanguageServerStatusSource
  target: LanguageServerDocumentTarget
  onOpenDefinition?: (target: LanguageServerDefinitionTarget) => void | boolean
  onOpenReferences?: (result: LanguageServerReferencesResult) => void | boolean
}

export function createMatchedLanguageServerPlugin({
  enabled,
  matches,
  rootPath,
  statusSource,
  target,
  onOpenDefinition,
  onOpenReferences,
}: MatchedLanguageServerPluginOptions): LanguageServerPlugin {
  const eligible = enabled ? (matches ?? []) : []
  if (eligible.length === 0) return createIdleLanguageServerPlugin(statusSource)

  const descriptors = eligible.map((match) => ({
    ...match,
    features: withoutDisabledFeatures(match.features, target.disabledFeatures),
  }))
  const semanticOwner = highestRankedMatch(descriptors, 'semanticTokens')
  const semanticTokens = semanticOwner
    ? new SemanticTokenController({ serverId: semanticOwner.serverId })
    : null
  const lanes = descriptors.map((match) =>
    liveLanguageServerLane({
      match,
      rootPath,
      semanticOwner,
      semanticTokens,
      statusSource,
      target,
    }),
  )
  const plugin = createLanguageServerSetPlugin({
    lanes,
    documentSync: {
      languageIdForDocument: (_languageId, uri) => lspLanguageIdForPath(uri),
    },
    semanticTokens: semanticTokens ? semanticTokenLayerOptions(semanticTokens) : undefined,
    onOpenDefinition,
    onOpenReferences,
  })

  return initializeStatusOnActivation(plugin, statusSource, descriptors)
}

function liveLanguageServerLane({
  match,
  rootPath,
  semanticOwner,
  semanticTokens,
  statusSource,
  target,
}: {
  match: LanguageServerMatch
  rootPath: string
  semanticOwner: LanguageServerMatch | null
  semanticTokens: SemanticTokenController | null
  statusSource: EditorLanguageServerStatusSource
  target: LanguageServerDocumentTarget
}): LanguageServerLaneOptions {
  const ownsSemanticTokens = semanticOwner?.serverId === match.serverId
  return {
    ...languageServerLaneOptions({
      connectionProvider: languageServerConnectionProvider({
        rootPath: match.root,
        serverId: match.serverId,
      }),
      match,
      rootPath,
      target,
    }),
    notificationHandlers: laneNotificationHandlers(
      match.serverId,
      ownsSemanticTokens ? semanticTokens : null,
      statusSource,
    ),
    onConnectionCreated:
      ownsSemanticTokens && semanticTokens
        ? (context) => {
            semanticTokens.attachConnection(context)
            return { dispose: () => semanticTokens.detachConnection() }
          }
        : undefined,
    onConnected:
      ownsSemanticTokens && semanticTokens
        ? () => {
            semanticTokens.handleConnected()
          }
        : undefined,
    onStatusChange: (status) => statusSource.setServerStatus(match.serverId, status),
    onDiagnostics: (diagnostics) => statusSource.setServerDiagnostics(match.serverId, diagnostics),
    onInteractiveReady: () => statusSource.setServerInteractiveReady(match.serverId),
    onError: () => statusSource.setServerStatus(match.serverId, 'error'),
  }
}

export function languageServerLaneOptions({
  connectionProvider,
  match,
  rootPath,
  target,
}: {
  connectionProvider: LspConnectionProvider
  match: LanguageServerMatch
  rootPath: string
  target: LanguageServerDocumentTarget
}): LanguageServerLaneOptions {
  return {
    id: match.serverId,
    features: match.features as LanguageServerFeatureRanks,
    capabilities: semanticTokensCapabilityForServer(match.serverId),
    clientInfo: LANGUAGE_SERVER_CLIENT_INFO,
    rootUri: fileUriForPath(match.root),
    connectionProvider,
    readyNotifications: target.sharedNotificationsByServer?.[match.serverId],
    webSocketRoute: languageServerRoute(rootPath, target.matchPath, match.serverId),
    webSocketTransportOptions: {
      WebSocketCtor: EdenLanguageServerWebSocket,
    },
  }
}

function laneNotificationHandlers(
  serverId: string,
  semanticTokens: SemanticTokenController | null,
  statusSource: EditorLanguageServerStatusSource,
) {
  return {
    [LSP_SEMANTIC_TOKENS_REFRESH]: () => {
      semanticTokens?.handleRefresh()
      return semanticTokens !== null
    },
    [LSP_SERVER_EXITED]: () => {
      statusSource.setServerStatus(serverId, 'error')
      return true
    },
  }
}

function semanticTokenLayerOptions(semanticTokens: SemanticTokenController) {
  return {
    onLayer: (
      layer: Parameters<SemanticTokenController['attachLayer']>[0],
      document: Parameters<SemanticTokenController['attachLayer']>[1],
    ) => {
      semanticTokens.attachLayer(layer, document)
    },
    onRangeNeeded: semanticTokens.handleRangeNeeded.bind(semanticTokens),
    onResyncRequired: semanticTokens.handleResyncRequired.bind(semanticTokens),
    scopeAliases: semanticTokens.scopeAliases,
    viewportDelayMs: 0,
  }
}

function initializeStatusOnActivation(
  plugin: LanguageServerPlugin,
  statusSource: EditorLanguageServerStatusSource,
  matches: readonly LanguageServerMatch[],
): LanguageServerPlugin {
  return {
    name: plugin.name,
    activate: (context) => {
      statusSource.setServers(matches.map((match) => match.serverId))
      return plugin.activate(context)
    },
  }
}

function createIdleLanguageServerPlugin(
  statusSource: EditorLanguageServerStatusSource,
): LanguageServerPlugin {
  return {
    name: 'editor.language-server.idle',
    activate: () => {
      statusSource.setServers([])
      return []
    },
  }
}

function highestRankedMatch(
  matches: readonly LanguageServerMatch[],
  feature: LspFeatureId,
): LanguageServerMatch | null {
  return (
    matches
      .filter((match) => match.features[feature] !== undefined)
      .toSorted(
        (left, right) =>
          (left.features[feature] ?? 0) - (right.features[feature] ?? 0) ||
          matches.indexOf(left) - matches.indexOf(right),
      )[0] ?? null
  )
}

function withoutDisabledFeatures(
  features: LanguageServerMatch['features'],
  disabled: readonly LspFeatureId[] | undefined,
): LanguageServerMatch['features'] {
  if (!disabled || disabled.length === 0) return features

  return Object.fromEntries(
    Object.entries(features).filter(([feature]) => !disabled.includes(feature as LspFeatureId)),
  )
}

function languageServerRoute(rootPath: string, matchPath: string, serverId: string) {
  const url = new URL('/lsp', serverUrl)
  if (url.protocol === 'http:') url.protocol = 'ws:'
  if (url.protocol === 'https:') url.protocol = 'wss:'
  url.searchParams.set('root', rootPath)
  url.searchParams.set('path', matchPath)
  url.searchParams.set('server', serverId)
  return url
}

function fileUriForPath(path: string) {
  const normalized = path.replace(/^\/+/, '')
  return `file:///${normalized.split('/').map(encodeURIComponent).join('/')}`
}

export function languageServerMatches(value: unknown): readonly LanguageServerMatch[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const match = languageServerMatch(item)
    return match ? [match] : []
  })
}

function languageServerMatch(value: unknown): LanguageServerMatch | null {
  if (!value || typeof value !== 'object') return null

  const match = value as Record<string, unknown>
  if (typeof match.root !== 'string') return null
  if (typeof match.serverId !== 'string') return null
  const features = languageServerFeatures(match.features)
  if (!features) return null

  return { root: match.root, serverId: match.serverId, features }
}

function languageServerFeatures(value: unknown): LanguageServerMatch['features'] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const features: Partial<Record<LspFeatureId, number>> = {}
  for (const [feature, rank] of Object.entries(value)) {
    if (!LSP_FEATURE_IDS.includes(feature as LspFeatureId)) return null
    if (typeof rank !== 'number' || !Number.isInteger(rank) || rank < 0) return null
    features[feature as LspFeatureId] = rank
  }

  return features
}
