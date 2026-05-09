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
import type { CachedEditorDocument } from "@/components/editor/editor-state"
import type { EditorStatusBarState } from "@/components/editor/editor-status-bar"
import { languageIdForFilePath } from "@/components/editor/file-path"
import { useTheme } from "@/components/theme-provider"
import type { EditorWorkspaceEntry } from "@/components/editor/types"
import { useEditorStatusBarState } from "@/components/editor/use-editor-status-bar-state"
import { fsServerUrl } from "@/lib/fs-client"
import { useEffect, useLayoutEffect, useMemo, useState } from "react"

type EditorProps = {
  document: CachedEditorDocument
  rootPath: string
  workspaceEntries: readonly EditorWorkspaceEntry[]
  definitionTarget?: TypeScriptLspDefinitionTarget | null
  onDirtyChange?: (path: string, dirty: boolean) => void
  onOpenDefinition?: (target: TypeScriptLspDefinitionTarget) => void | boolean
  onScrollPositionChange?: (
    path: string,
    scrollPosition: NonNullable<CachedEditorDocument["scrollPosition"]>
  ) => void
  onStatusChange?: (status: EditorStatusBarState) => void
}

const editorThemeRefreshByShikiTheme = {
  "github-dark": {},
  "github-light": {},
}

export function Editor({
  definitionTarget,
  document: cachedDocument,
  rootPath,
  onDirtyChange,
  onOpenDefinition,
  onScrollPositionChange,
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
      documentId: cachedDocument.path,
      languageId: languageIdForFilePath(cachedDocument.path),
      revision: cachedDocument.revision,
      scrollPosition: cachedDocument.scrollPosition,
      session: cachedDocument.session,
      text: cachedDocument.session.getText(),
    }),
    [cachedDocument]
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
  const selection = selectionForDefinition(
    cachedDocument.path,
    text,
    definitionTarget
  )

  useEditorStatusBarState({
    charCount: text.length,
    filePath: cachedDocument.path,
    onChange: onStatusChange,
    state: editorState,
    typeScriptDiagnostics,
    typeScriptStatus,
  })

  useEffect(() => {
    onDirtyChange?.(
      cachedDocument.path,
      editorState?.isDirty ?? cachedDocument.session.isDirty()
    )
  }, [cachedDocument, editorState?.isDirty, onDirtyChange])

  useLayoutEffect(() => {
    return () => {
      const scrollPosition = controller.getEditor()?.getScrollPosition()
      if (!scrollPosition) return

      onScrollPositionChange?.(cachedDocument.path, scrollPosition)
    }
  }, [cachedDocument.path, controller, onScrollPositionChange])

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
  filePath: string,
  text: string,
  target: TypeScriptLspDefinitionTarget | null | undefined
) {
  if (!target) return null
  if (target.path !== filePath) return null

  const anchor = offsetForPosition(text, target.range.start)
  const head = offsetForPosition(text, target.range.end)
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
