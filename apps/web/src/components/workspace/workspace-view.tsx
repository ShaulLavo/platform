import { ArrowClockwiseIcon } from "@phosphor-icons/react"

import { EditorStatusBar } from "@/components/editor/editor-status-bar"
import { useEditorState } from "@/components/editor/editor-state"
import type { PickedFsEntry } from "@/components/file-picker-dialog"
import { FileViewer } from "@/components/workspace/file-viewer"
import { TreePane } from "@/components/workspace/tree-pane"
import type { FileResult, TreeEntry } from "@/lib/file-system-types"
import type { LoadState } from "@/lib/load-state"
import {
  EMPTY_TREE_MODEL,
  selectedTreeEntry,
  treeStateLabel,
  type TreeModel,
  workspaceSourceEntries,
} from "@/lib/tree-model"
import { Button } from "@workspace/ui/components/button"

export function WorkspaceView({
  fileState,
  rootFolder,
  treeState,
  onLoadDirectory,
  onRetryTree,
}: {
  fileState: LoadState<FileResult>
  rootFolder: PickedFsEntry
  treeState: LoadState<TreeModel>
  onLoadDirectory: (entry: TreeEntry, treePath: string) => void
  onRetryTree: () => void
}) {
  const selectedFilePath = useEditorState((state) => state.selectedFilePath)
  const editorStatus = useEditorState((state) => state.editorStatus)
  const treeModel = treeState.status === "ready" ? treeState.data : null
  const workspaceEntries = workspaceSourceEntries(treeModel)
  const selectedEntry = selectedFilePath
    ? selectedTreeEntry(treeState, rootFolder.path, selectedFilePath)
    : null

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
              state={treeState}
              onLoadDirectory={onLoadDirectory}
            />
          </div>
        </aside>
        <FileViewer
          entry={selectedEntry}
          fileState={fileState}
          rootPath={rootFolder.path}
          workspaceEntries={workspaceEntries}
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
