import { EditorStatusBar } from "@/features/editor/components/editor-status-bar"
import { useEditorUiState } from "@/features/editor/state/editor-ui-state"
import { useEditorWorkspaceState } from "@/features/editor/state/editor-workspace-state"
import type { PickedFsEntry } from "@/lib/file-system-types"
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
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@workspace/ui/components/resizable"
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
  const statusBarState = useEditorUiState((state) => state.statusBarState)
  const workspacePanelTab = useEditorWorkspaceState(
    (state) => state.workspacePanelTab
  )
  const setWorkspacePanelTab = useEditorWorkspaceState(
    (state) => state.setWorkspacePanelTab
  )
  const treeModel = treeState.status === "ready" ? treeState.data : null

  function handleWorkspacePanelTabChange(value: string) {
    if (!isWorkspacePanelTab(value)) return

    setWorkspacePanelTab(value)
  }

  return (
    <div className="h-full min-h-0 flex-1 overflow-auto">
      <div className="flex h-full min-w-[1024px] flex-col">
        <ResizablePanelGroup
          className="min-h-0 flex-1"
          orientation="horizontal"
        >
          <ResizablePanel
            id="workspace-sidebar"
            className="min-h-0"
            defaultSize="320px"
            minSize="240px"
            maxSize="50%"
            groupResizeBehavior="preserve-pixel-size"
          >
            <aside className="flex h-full min-h-0 flex-col">
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
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel
            id="workspace-editor"
            className="h-full min-h-0 min-w-0 overflow-hidden"
            minSize="480px"
          >
            <FileViewer fileState={fileState} rootPath={rootFolder.path} />
          </ResizablePanel>
        </ResizablePanelGroup>
        {statusBarState && (
          <div className="min-w-0">
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
