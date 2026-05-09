import type {
  TypeScriptLspDefinitionTarget,
  TypeScriptLspDiagnosticSummary,
  TypeScriptLspStatus,
} from "@editor/typescript-lsp"
import { createTypeScriptLspPlugin } from "@editor/typescript-lsp/websocket"
import { useMemo, useState } from "react"

import { fsServerUrl } from "@/lib/fs-client"

type UseTypeScriptLspPluginOptions = {
  rootPath: string
  onOpenDefinition?: (target: TypeScriptLspDefinitionTarget) => void | boolean
}

export function useTypeScriptLspPlugin({
  rootPath,
  onOpenDefinition,
}: UseTypeScriptLspPluginOptions) {
  const [typeScriptStatus, setTypeScriptStatus] =
    useState<TypeScriptLspStatus>("idle")
  const [typeScriptDiagnostics, setTypeScriptDiagnostics] =
    useState<TypeScriptLspDiagnosticSummary | null>(null)
  const typeScriptLsp = useMemo(
    () =>
      createTypeScriptLspPlugin({
        rootUri: fileUriForPath(rootPath),
        webSocketRoute: typeScriptLspRoute(rootPath),
        onStatusChange: setTypeScriptStatus,
        onDiagnostics: setTypeScriptDiagnostics,
        onOpenDefinition,
        onError: (error) => console.warn("[typescript-lsp]", error),
      }),
    [onOpenDefinition, rootPath]
  )

  return {
    typeScriptDiagnostics,
    typeScriptLsp,
    typeScriptStatus,
  }
}

function typeScriptLspRoute(rootPath: string) {
  const url = new URL("/lsp/typescript", fsServerUrl)
  if (url.protocol === "http:") url.protocol = "ws:"
  if (url.protocol === "https:") url.protocol = "wss:"
  url.searchParams.set("root", rootPath)
  return url
}

function fileUriForPath(path: string) {
  const normalized = path.replace(/^\/+/, "")
  return `file:///${normalized.split("/").map(encodeURIComponent).join("/")}`
}
