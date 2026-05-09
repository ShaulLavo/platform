import { EditorStatusBar } from "@/components/editor/editor-status-bar"
import { useEditorState } from "@/components/editor/editor-state"
import type { PickedFsEntry } from "@/components/file-picker-dialog"
import { FileViewer } from "@/components/workspace/file-viewer"
import { TreePane } from "@/components/workspace/tree-pane"
import { FolderIcon, GitBranchIcon } from "@phosphor-icons/react"
import { Panel as GitPanel } from "@/features/git/panel"
import { useStatus } from "@/features/git/hooks"
import { statusEntriesForTree } from "@/features/git/status-entries-for-tree"
import type { FileResult, TreeEntry } from "@/lib/file-system-types"
import type { LoadState } from "@/lib/load-state"
import type { WorkspacePanelTab } from "@/lib/workspace-cache"
import {
  EMPTY_TREE_MODEL,
  treeStateLabel,
  type TreeModel,
} from "@/lib/tree-model"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import { useMemo } from "react"

export function WorkspaceView({
  fileState,
  rootFolder,
  treeState,
  onLoadDirectory,
}: {
  fileState: LoadState<FileResult>
  rootFolder: PickedFsEntry
  treeState: LoadState<TreeModel>
  onLoadDirectory: (entry: TreeEntry, treePath: string) => void
}) {
  const statusBarState = useEditorState((state) => state.statusBarState)
  const workspacePanelTab = useEditorState((state) => state.workspacePanelTab)
  const setWorkspacePanelTab = useEditorState(
    (state) => state.setWorkspacePanelTab
  )
  const treeModel = treeState.status === "ready" ? treeState.data : null

  function handleWorkspacePanelTabChange(value: string) {
    if (!isWorkspacePanelTab(value)) return

    setWorkspacePanelTab(value)
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="grid h-full min-w-[1024px] grid-cols-[320px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto]">
        <aside className="flex min-h-0 flex-col border-r">
          <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
            <div className="min-w-0">
              <div className="truncate text-xs font-medium">
                {rootFolder.name}
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                {treeStateLabel(treeState)}
              </div>
            </div>
          </div>
          <Tabs
            className="min-h-0 flex-1"
            value={workspacePanelTab}
            orientation="horizontal"
            onValueChange={handleWorkspacePanelTabChange}
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="files">
                <FolderIcon />
                Files
              </TabsTrigger>
              <TabsTrigger value="git">
                <GitBranchIcon />
                Git
              </TabsTrigger>
            </TabsList>
            <TabsContent keepMounted value="files">
              <WorkspaceTreePane
                key={rootFolder.path}
                model={treeModel ?? EMPTY_TREE_MODEL}
                rootPath={rootFolder.path}
                state={treeState}
                onLoadDirectory={onLoadDirectory}
              />
            </TabsContent>
            <TabsContent keepMounted value="git">
              <GitPanel rootPath={rootFolder.path} />
            </TabsContent>
          </Tabs>
        </aside>
        <FileViewer fileState={fileState} rootPath={rootFolder.path} />
        {statusBarState && (
          <div className="col-span-2 min-w-0">
            <EditorStatusBar {...statusBarState} />
          </div>
        )}
      </div>
    </div>
  )
}

function isWorkspacePanelTab(value: string): value is WorkspacePanelTab {
  return value === "files" || value === "git"
}

function WorkspaceTreePane({
  model,
  rootPath,
  state,
  onLoadDirectory,
}: {
  model: TreeModel
  rootPath: string
  state: LoadState<TreeModel>
  onLoadDirectory: (entry: TreeEntry, treePath: string) => void
}) {
  const gitStatus = useStatus(rootPath)
  const gitStatusEntries = useMemo(
    () => statusEntriesForTree(gitStatus.data?.files ?? [], rootPath),
    [gitStatus.data?.files, rootPath]
  )

  return (
    <TreePane
      gitStatus={gitStatusEntries}
      model={model}
      rootPath={rootPath}
      state={state}
      onLoadDirectory={onLoadDirectory}
    />
  )
}
