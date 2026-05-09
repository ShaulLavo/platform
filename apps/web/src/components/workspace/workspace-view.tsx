import { ArrowClockwiseIcon } from "@phosphor-icons/react"
import { useCallback, useState } from "react"

import type { PickedFsEntry } from "@/components/file-picker-dialog"
import {
  EditorStatusBar,
  type EditorStatusBarState,
} from "@/components/editor/editor-status-bar"
import {
  formatHistoryStatus,
  formatSyntaxStatus,
  formatTypeScriptLspStatus,
} from "@/components/editor/status-formatters"
import { FileViewer } from "@/components/workspace/file-viewer"
import { TreePane } from "@/components/workspace/tree-pane"
import type { FileResult, TreeEntry } from "@/lib/file-system-types"
import type { LoadState } from "@/lib/load-state"
import {
  EMPTY_TREE_MODEL,
  treeStateLabel,
  type TreeModel,
  workspaceSourceEntries,
} from "@/lib/tree-model"
import type { TypeScriptLspDefinitionTarget } from "@editor/typescript-lsp"
import { Button } from "@workspace/ui/components/button"

export function WorkspaceView({
  definitionTarget,
  fileState,
  onOpenDefinition,
  rootFolder,
  selectedEntry,
  selectedFilePath,
  setSelectedFilePath,
  treeState,
  onLoadDirectory,
  onRetryTree,
}: {
  definitionTarget: TypeScriptLspDefinitionTarget | null
  fileState: LoadState<FileResult>
  onOpenDefinition: (target: TypeScriptLspDefinitionTarget) => void | boolean
  rootFolder: PickedFsEntry
  selectedEntry: TreeEntry | null
  selectedFilePath: string | null
  setSelectedFilePath: (path: string | null) => void
  treeState: LoadState<TreeModel>
  onLoadDirectory: (entry: TreeEntry, treePath: string) => void
  onRetryTree: () => void
}) {
  const treeModel = treeState.status === "ready" ? treeState.data : null
  const workspaceEntries = workspaceSourceEntries(treeModel)
  const [editorStatus, setEditorStatus] =
    useState<EditorStatusBarState | null>(null)
  const handleEditorStatusChange = useCallback(
    (status: EditorStatusBarState | null) => {
      setEditorStatus((currentStatus) => {
        if (!status) return null
        if (sameEditorStatus(currentStatus, status)) return currentStatus

        return status
      })
    },
    []
  )

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="grid h-full min-w-[1024px] grid-cols-[320px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto]">
        <aside className="flex min-h-0 flex-col border-r">
          <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b px-3">
            <div className="min-w-0">
              <div className="truncate text-xs font-medium">
                {rootFolder.name}
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                {treeStateLabel(treeState)}
              </div>
            </div>
            <Button
              aria-label="Refresh tree"
              onClick={onRetryTree}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <ArrowClockwiseIcon />
            </Button>
          </div>
          <div className="min-h-0 flex-1">
            <TreePane
              key={rootFolder.path}
              model={treeModel ?? EMPTY_TREE_MODEL}
              rootPath={rootFolder.path}
              selectedFilePath={selectedFilePath}
              setSelectedFilePath={setSelectedFilePath}
              state={treeState}
              onLoadDirectory={onLoadDirectory}
            />
          </div>
        </aside>
        <FileViewer
          definitionTarget={definitionTarget}
          entry={selectedEntry}
          fileState={fileState}
          rootPath={rootFolder.path}
          selectedFilePath={selectedFilePath}
          workspaceEntries={workspaceEntries}
          onEditorStatusChange={handleEditorStatusChange}
          onOpenDefinition={onOpenDefinition}
        />
        {editorStatus && (
          <div className="col-span-2 min-w-0">
            <EditorStatusBar {...editorStatus} />
          </div>
        )}
      </div>
    </div>
  )
}

function sameEditorStatus(
  currentStatus: EditorStatusBarState | null,
  nextStatus: EditorStatusBarState
) {
  if (!currentStatus) return false

  return editorStatusKey(currentStatus) === editorStatusKey(nextStatus)
}

function editorStatusKey(status: EditorStatusBarState) {
  const cursor = status.state?.documentId
    ? `${status.state.cursor.row}:${status.state.cursor.column}`
    : ""
  const syntax = formatSyntaxStatus(status.state)
  const history = formatHistoryStatus(status.state)
  const typeScript = formatTypeScriptLspStatus(
    status.typeScriptStatus,
    status.typeScriptDiagnostics
  )

  return [
    status.filePath,
    status.charCount,
    cursor,
    syntax,
    history,
    typeScript,
  ].join("\u0000")
}
