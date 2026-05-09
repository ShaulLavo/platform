import "@editor/core/style.css"
import "@editor/find/style.css"
import "@editor/minimap/style.css"
import { EditorHost, useEditor } from "@editor/react"
import "@editor/scope-lines/style.css"
import {
  createTypeScriptLspPlugin,
  type TypeScriptLspDefinitionTarget,
  type TypeScriptLspDiagnosticSummary,
  type TypeScriptLspStatus,
} from "@editor/typescript-lsp"

import { createEditorPlugins } from "@/components/editor/editor-plugins"
import type { EditorStatusBarState } from "@/components/editor/editor-status-bar"
import { languageIdForFilePath } from "@/components/editor/file-path"
import { useTheme } from "@/components/theme-provider"
import type {
  EditorFile,
  EditorWorkspaceEntry,
} from "@/components/editor/types"
import { useEditorStatusBarState } from "@/components/editor/use-editor-status-bar-state"
import { fsServerUrl } from "@/lib/fs-client"
import { useEffect, useLayoutEffect, useMemo, useState } from "react"

type EditorProps = {
  file: EditorFile
  rootPath: string
  workspaceEntries: readonly EditorWorkspaceEntry[]
  definitionTarget?: TypeScriptLspDefinitionTarget | null
  onOpenDefinition?: (target: TypeScriptLspDefinitionTarget) => void | boolean
  onStatusChange?: (status: EditorStatusBarState) => void
}

const editorThemeRefreshByShikiTheme = {
  "github-dark": {},
  "github-light": {},
}

export function Editor({
  definitionTarget,
  file,
  rootPath,
  onOpenDefinition,
  onStatusChange,
}: EditorProps) {
  const { theme } = useTheme()
  const resolvedTheme = useResolvedTheme(theme)
  const shikiTheme =
    resolvedTheme === "dark" ? "github-dark" : "github-light"
  const [shikiThemeSource] = useState(() =>
    createShikiThemeSource(shikiTheme)
  )
  const shikiThemeResolver = useMemo(
    () => shikiThemeSource.getTheme,
    [shikiThemeSource]
  )
  const editorThemeRefresh = editorThemeRefreshByShikiTheme[shikiTheme]
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
  const plugins = useMemo(
    () => createEditorPlugins(typeScriptLsp, shikiThemeResolver),
    [shikiThemeResolver, typeScriptLsp]
  )
  const document = useMemo(
    () => ({
      documentId: file.path,
      languageId: languageIdForFilePath(file.path),
      revision: file.mtimeMs,
      text: file.content,
    }),
    [file.content, file.mtimeMs, file.path]
  )

  useLayoutEffect(() => {
    shikiThemeSource.setTheme(shikiTheme)
  }, [shikiTheme, shikiThemeSource])

  const controller = useEditor({
    cursorLineHighlight: {
      gutterNumber: true,
      gutterBackground: ["fold-gutter"],
      rowBackground: true,
    },
    document,
    plugins,
    theme: editorThemeRefresh,
  })
  const editorState = controller.useState()
  const text = controller.useText()
  const selection = selectionForDefinition(file, definitionTarget)

  useEditorStatusBarState({
    charCount: text.length,
    filePath: file.path,
    onChange: onStatusChange,
    state: editorState,
    typeScriptDiagnostics,
    typeScriptStatus,
  })

  useEffect(() => {
    if (!selection) return
    controller.commands.setSelection(
      selection.anchor,
      selection.head,
      selection.anchor
    )
  }, [controller, selection])

  return (
    <div className="flex h-full w-full min-w-0 flex-1 bg-background">
      <EditorHost
        className="app-editor-host"
        controller={controller}
      />
    </div>
  )
}

function createShikiThemeSource(initialTheme: string) {
  let theme = initialTheme

  return {
    getTheme: () => theme,
    setTheme: (nextTheme: string) => {
      theme = nextTheme
    },
  }
}

function useResolvedTheme(theme: "dark" | "light" | "system") {
  const [systemTheme, setSystemTheme] = useState<"dark" | "light">(() =>
    systemThemePreference()
  )

  useEffect(() => {
    if (theme !== "system") return

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    const handleChange = () => setSystemTheme(systemThemePreference())

    mediaQuery.addEventListener("change", handleChange)
    return () => mediaQuery.removeEventListener("change", handleChange)
  }, [theme])

  if (theme === "system") return systemTheme
  return theme
}

function systemThemePreference(): "dark" | "light" {
  if (window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark"
  return "light"
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

function selectionForDefinition(
  file: EditorFile,
  target: TypeScriptLspDefinitionTarget | null | undefined
) {
  if (!target) return null
  if (target.path !== file.path) return null

  const anchor = offsetForPosition(file.content, target.range.start)
  const head = offsetForPosition(file.content, target.range.end)
  return { anchor, head }
}

function offsetForPosition(
  text: string,
  position: TypeScriptLspDefinitionTarget["range"]["start"]
) {
  let line = 0
  let lineStart = 0

  for (let index = 0; index < text.length; index += 1) {
    if (line >= position.line) break
    if (text[index] !== "\n") continue
    line += 1
    lineStart = index + 1
  }

  if (line < position.line) return text.length
  return Math.min(text.length, lineStart + position.character)
}
