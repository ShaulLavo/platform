import {
  CircleNotchIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react"
import { useEffect } from "react"

import { Editor, type EditorWorkspaceEntry } from "@/components/editor"
import { useEditorState } from "@/components/editor/editor-state"
import type { EditorStatusBarState } from "@/components/editor/editor-status-bar"
import { EditorTabBar } from "@/components/workspace/editor-tab-bar"
import type { FileResult } from "@/lib/file-system-types"
import type { LoadState } from "@/lib/load-state"
import type { TypeScriptLspDefinitionTarget } from "@editor/typescript-lsp"

export function FileViewer({
  fileState,
  rootPath,
  workspaceEntries,
}: {
  fileState: LoadState<FileResult>
  rootPath: string
  workspaceEntries: readonly EditorWorkspaceEntry[]
}) {
  const definitionTarget = useEditorState((state) => state.definitionTarget)
  const selectedFilePath = useEditorState((state) => state.selectedFilePath)
  const setStatusBarState = useEditorState((state) => state.setStatusBarState)
  const openDefinition = useEditorState((state) => state.openDefinition)

  useEffect(() => {
    if (selectedFilePath && fileState.status === "ready") return

    setStatusBarState(null)
  }, [fileState.status, selectedFilePath, setStatusBarState])

  return (
    <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)]">
      <EditorTabBar />
      {selectedFilePath ? (
        <FileViewerBody
          definitionTarget={definitionTarget}
          fileState={fileState}
          rootPath={rootPath}
          workspaceEntries={workspaceEntries}
          onEditorStatusChange={setStatusBarState}
          onOpenDefinition={openDefinition}
        />
      ) : (
        <FileViewerEmpty />
      )}
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
