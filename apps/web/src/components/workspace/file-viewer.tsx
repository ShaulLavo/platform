import {
  CircleNotchIcon,
  FileIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react"
import { useEffect } from "react"

import { Editor, type EditorWorkspaceEntry } from "@/components/editor"
import type { EditorStatusBarState } from "@/components/editor/editor-status-bar"
import type { FileResult, TreeEntry } from "@/lib/file-system-types"
import type { LoadState } from "@/lib/load-state"
import { basename, displayPath, formatSize } from "@/lib/path-formatters"
import type { TypeScriptLspDefinitionTarget } from "@editor/typescript-lsp"
import { Badge } from "@workspace/ui/components/badge"

export function FileViewer({
  definitionTarget,
  entry,
  fileState,
  rootPath,
  selectedFilePath,
  workspaceEntries,
  onOpenDefinition,
  onEditorStatusChange,
}: {
  definitionTarget: TypeScriptLspDefinitionTarget | null
  entry: TreeEntry | null
  fileState: LoadState<FileResult>
  rootPath: string
  selectedFilePath: string | null
  workspaceEntries: readonly EditorWorkspaceEntry[]
  onOpenDefinition: (target: TypeScriptLspDefinitionTarget) => void | boolean
  onEditorStatusChange: (status: EditorStatusBarState | null) => void
}) {
  useEffect(() => {
    if (selectedFilePath && fileState.status === "ready") return

    onEditorStatusChange(null)
  }, [fileState.status, onEditorStatusChange, selectedFilePath])

  if (!selectedFilePath) return <FileViewerEmpty />

  const displayedFile = fileState.status === "ready" ? fileState.data : null
  const displayedPath = displayedFile?.path ?? selectedFilePath
  const displayedEntry = entry?.path === displayedPath ? entry : null
  const displayedSize = displayedEntry?.size ?? displayedFile?.size

  return (
    <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)]">
      <div className="flex h-10 min-w-0 items-center justify-between gap-3 border-b px-3">
        <div className="flex min-w-0 items-center gap-2">
          <FileIcon className="size-4 shrink-0 text-sky-600" weight="duotone" />
          <div className="min-w-0">
            <div className="truncate text-xs font-medium">
              {displayedEntry?.name ?? basename(displayedPath)}
            </div>
            <div className="truncate text-[11px] text-muted-foreground">
              {displayPath(displayedPath)}
            </div>
          </div>
        </div>
        {typeof displayedSize === "number" && (
          <Badge className="shrink-0" variant="outline">
            {formatSize(displayedSize)}
          </Badge>
        )}
      </div>
      <FileViewerBody
        definitionTarget={definitionTarget}
        fileState={fileState}
        rootPath={rootPath}
        workspaceEntries={workspaceEntries}
        onEditorStatusChange={onEditorStatusChange}
        onOpenDefinition={onOpenDefinition}
      />
    </section>
  )
}

function FileViewerEmpty() {
  return <section className="min-h-[320px]" />
}

function FileViewerBody({
  definitionTarget,
  fileState,
  rootPath,
  workspaceEntries,
  onEditorStatusChange,
  onOpenDefinition,
}: {
  definitionTarget: TypeScriptLspDefinitionTarget | null
  fileState: LoadState<FileResult>
  rootPath: string
  workspaceEntries: readonly EditorWorkspaceEntry[]
  onEditorStatusChange: (status: EditorStatusBarState | null) => void
  onOpenDefinition: (target: TypeScriptLspDefinitionTarget) => void | boolean
}) {
  if (fileState.status === "loading") {
    return (
      <div className="flex min-h-0 items-center justify-center p-6 text-xs text-muted-foreground">
        <CircleNotchIcon className="mr-2 size-4 animate-spin" />
        Loading file
      </div>
    )
  }
  if (fileState.status === "error") {
    return (
      <div className="flex min-h-0 items-center justify-center p-6 text-xs text-muted-foreground">
        <WarningCircleIcon className="mr-2 size-4" />
        {fileState.message}
      </div>
    )
  }
  if (fileState.status !== "ready") return null

  return (
    <Editor
      definitionTarget={definitionTarget}
      file={fileState.data}
      rootPath={rootPath}
      workspaceEntries={workspaceEntries}
      onStatusChange={onEditorStatusChange}
      onOpenDefinition={onOpenDefinition}
    />
  )
}
