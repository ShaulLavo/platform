import type {
  LanguageServerDefinitionTarget,
  LanguageServerDiagnosticSummary,
  LanguageServerPlugin,
  LanguageServerReferencesResult,
  LanguageServerStatus,
} from "@editor/language-server"
import { createLanguageServerPlugin } from "@editor/language-server/websocket"
import { useEffect, useMemo, useState } from "react"

import { fsServerUrl } from "@/lib/fs-client"

type UseLanguageServerPluginOptions = {
  filePath: string
  rootPath: string
  onOpenDefinition?: (target: LanguageServerDefinitionTarget) => void | boolean
  onOpenReferences?: (result: LanguageServerReferencesResult) => void | boolean
}

export function useLanguageServerPlugin({
  filePath,
  rootPath,
  onOpenDefinition,
  onOpenReferences,
}: UseLanguageServerPluginOptions) {
  const [languageServerStatus, setLanguageServerStatus] =
    useState<LanguageServerStatus>("idle")
  const [languageServerDiagnostics, setLanguageServerDiagnostics] =
    useState<LanguageServerDiagnosticSummary | null>(null)
  const matchKey = languageServerMatchKey(rootPath, filePath)
  const [matchState, setMatchState] = useState<LanguageServerMatchState | null>(
    null
  )
  const match = matchState?.key === matchKey ? matchState.match : null

  useEffect(() => {
    const controller = new AbortController()
    fetch(languageServerMatchRoute(rootPath, filePath), {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((value: unknown) => {
        if (!controller.signal.aborted) {
          setMatchState({ key: matchKey, match: languageServerMatch(value) })
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setMatchState({ key: matchKey, match: null })
        }
      })

    return () => controller.abort()
  }, [filePath, matchKey, rootPath])

  const languageServer = useMemo(
    () => {
      if (!match) return idleLanguageServerPlugin

      return createLanguageServerPlugin({
        rootUri: fileUriForPath(rootPath),
        webSocketRoute: languageServerRoute(rootPath, filePath, match.serverId),
        onStatusChange: setLanguageServerStatus,
        onDiagnostics: setLanguageServerDiagnostics,
        onOpenDefinition,
        onOpenReferences,
        onError: () => undefined,
      })
    },
    [filePath, match, onOpenDefinition, onOpenReferences, rootPath]
  )

  return {
    languageServerDiagnostics: match ? languageServerDiagnostics : null,
    languageServer,
    languageServerStatus: match ? languageServerStatus : "idle",
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
  name: "editor.language-server.idle",
  activate: () => [],
}

function languageServerMatchKey(rootPath: string, filePath: string) {
  return `${rootPath}\u0000${filePath}`
}

function languageServerMatchRoute(rootPath: string, filePath: string) {
  const url = new URL("/lsp/match", fsServerUrl)
  url.searchParams.set("root", rootPath)
  url.searchParams.set("path", filePath)
  return url
}

function languageServerRoute(
  rootPath: string,
  filePath: string,
  serverId: string
) {
  const url = new URL("/lsp", fsServerUrl)
  if (url.protocol === "http:") url.protocol = "ws:"
  if (url.protocol === "https:") url.protocol = "wss:"
  url.searchParams.set("root", rootPath)
  url.searchParams.set("path", filePath)
  url.searchParams.set("server", serverId)
  return url
}

function fileUriForPath(path: string) {
  const normalized = path.replace(/^\/+/, "")
  return `file:///${normalized.split("/").map(encodeURIComponent).join("/")}`
}

function languageServerMatch(value: unknown): LanguageServerMatch | null {
  if (!value || typeof value !== "object") return null

  const match = value as Record<string, unknown>
  if (typeof match.root !== "string") return null
  if (typeof match.serverId !== "string") return null

  return { root: match.root, serverId: match.serverId }
}
