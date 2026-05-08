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
import { EditorStatusBar } from "@/components/editor/editor-status-bar"
import { languageIdForFilePath } from "@/components/editor/file-path"
import type {
  EditorFile,
  EditorWorkspaceEntry,
} from "@/components/editor/types"
import { fsServerUrl } from "@/lib/fs-client"
import { useEffect, useMemo, useState } from "react"

type EditorProps = {
  file: EditorFile
  rootPath: string
  workspaceEntries: readonly EditorWorkspaceEntry[]
  definitionTarget?: TypeScriptLspDefinitionTarget | null
  onOpenDefinition?: (target: TypeScriptLspDefinitionTarget) => void | boolean
}

export function Editor({
  definitionTarget,
  file,
  rootPath,
  workspaceEntries: _workspaceEntries,
  onOpenDefinition,
}: EditorProps) {
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
    () => createEditorPlugins(typeScriptLsp),
    [typeScriptLsp]
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
  const controller = useEditor({
    cursorLineHighlight: {
      gutterNumber: true,
      gutterBackground: ["fold-gutter"],
      rowBackground: true,
    },
    document,
    plugins,
  })
  const editorState = controller.useState()
  const text = controller.useText()
  const selection = useMemo(
    () => selectionForDefinition(file, definitionTarget),
    [definitionTarget, file]
  )

  useEffect(() => {
    if (!selection) return
    controller.commands.setSelection(selection.anchor, selection.head, selection.anchor)
  }, [controller, selection])

  return (
    <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] bg-background">
      <EditorHost className="app-editor-host" controller={controller} />
      <EditorStatusBar
        filePath={file.path}
        state={editorState}
        text={text}
        typeScriptDiagnostics={typeScriptDiagnostics}
        typeScriptStatus={typeScriptStatus}
      />
    </div>
  )
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
