import { EditorStatusBar } from "@/features/editor/components/editor-status-bar"
import type { RequestCloseTab } from "@/features/editor/hooks/use-dirty-tab-close"
import { useEditorUiState } from "@/features/editor/state/editor-ui-state"
import { useEditorWorkspaceState } from "@/features/editor/state/editor-workspace-state"
import type { PickedFsEntry } from "@/lib/file-system-types"
import { FileViewer } from "@/components/workspace/file-viewer"
import { TreePane } from "@/components/workspace/tree-pane"
import { WorkspaceSearchPane } from "@/components/workspace/workspace-search-pane"
import {
  FolderIcon,
  GitBranchIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react"
import { useSearchBufferRuntime } from "@/features/search/use-search-buffer"
import { Panel as GitPanel } from "@/features/git/panel"
import { useStatus } from "@/features/git/hooks"
import { statusEntriesForTree } from "@/features/git/status-entries-for-tree"
import type { FileResult, TreeEntry } from "@/lib/file-system-types"
import type { LoadState } from "@/lib/load-state"
import type { WorkspacePanelTab } from "@/lib/workspace-cache"
import { treeStateLabel, type TreeModel } from "@/lib/tree-model"
import type { EditorKeymapLayer } from "@editor/core"
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
  editorKeymapLayers,
  fileState,
  rootFolder,
  treeState,
  onLoadDirectory,
  onRequestCloseTab,
}: {
  editorKeymapLayers: readonly EditorKeymapLayer[]
  fileState: LoadState<FileResult>
  rootFolder: PickedFsEntry
  treeState: LoadState<TreeModel>
  onLoadDirectory: (entry: TreeEntry, treePath: string) => void
  onRequestCloseTab: RequestCloseTab
}) {
  const statusBarState = useEditorUiState((state) => state.statusBarState)
  const sidebarVisible = useEditorWorkspaceState(
    (state) => state.sidebarVisible
  )
  const workspacePanelTab = useEditorWorkspaceState(
    (state) => state.workspacePanelTab
  )
  const setWorkspacePanelTab = useEditorWorkspaceState(
    (state) => state.setWorkspacePanelTab
  )
  useSearchBufferRuntime(rootFolder.path)

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
          {sidebarVisible && (
            <>
              <ResizablePanel
                id="workspace-sidebar"
                className="min-h-0 min-w-0 overflow-hidden"
                defaultSize="320px"
                minSize="240px"
                maxSize="50%"
                groupResizeBehavior="preserve-pixel-size"
              >
                <aside className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
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
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="files">
                        <FolderIcon />
                        Files
                      </TabsTrigger>
                      <TabsTrigger value="search">
                        <MagnifyingGlassIcon />
                        Search
                      </TabsTrigger>
                      <TabsTrigger value="git">
                        <GitBranchIcon />
                        Git
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent keepMounted value="files">
                      <WorkspaceTreePane
                        key={rootFolder.path}
                        rootPath={rootFolder.path}
                        state={treeState}
                        onLoadDirectory={onLoadDirectory}
                      />
                    </TabsContent>
                    <TabsContent keepMounted value="search">
                      <WorkspaceSearchPane rootPath={rootFolder.path} />
                    </TabsContent>
                    <TabsContent keepMounted value="git">
                      <GitPanel rootPath={rootFolder.path} />
                    </TabsContent>
                  </Tabs>
                </aside>
              </ResizablePanel>
              <ResizableHandle withHandle />
            </>
          )}
          <ResizablePanel
            id="workspace-editor"
            className="h-full min-h-0 min-w-0 overflow-hidden"
            minSize="480px"
          >
            <FileViewer
              editorKeymapLayers={editorKeymapLayers}
              fileState={fileState}
              rootPath={rootFolder.path}
              onRequestCloseTab={onRequestCloseTab}
            />
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
  return value === "files" || value === "git" || value === "search"
}

function WorkspaceTreePane({
  rootPath,
  state,
  onLoadDirectory,
}: {
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
      rootPath={rootPath}
      state={state}
      onLoadDirectory={onLoadDirectory}
    />
  )
}
