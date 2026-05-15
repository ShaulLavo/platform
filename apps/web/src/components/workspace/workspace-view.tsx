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
import type { TreeModel } from "@/lib/tree-model"
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
import { cn } from "@workspace/ui/lib/utils"
import { useMemo, useState, type ReactNode } from "react"

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
  const setSidebarVisible = useEditorWorkspaceState(
    (state) => state.setSidebarVisible
  )
  const setWorkspacePanelTab = useEditorWorkspaceState(
    (state) => state.setWorkspacePanelTab
  )
  const [visibleTreeItemCount, setVisibleTreeItemCount] =
    useState<VisibleTreeItemCountSnapshot | null>(null)
  const currentVisibleTreeItemCount =
    treeState.status === "ready" &&
    visibleTreeItemCount?.rootPath === rootFolder.path
      ? visibleTreeItemCount.count
      : null
  useSearchBufferRuntime(rootFolder.path)

  function handleWorkspacePanelTabChange(value: string) {
    if (!isWorkspacePanelTab(value)) return

    selectWorkspacePanelTab(value)
  }

  function selectWorkspacePanelTab(tab: WorkspacePanelTab) {
    setWorkspacePanelTab(tab)
    if (sidebarVisible) return

    setSidebarVisible(true)
  }

  function handleVisibleTreeItemCountChange(count: number) {
    setVisibleTreeItemCount({ count, rootPath: rootFolder.path })
  }

  return (
    <div className="h-full min-h-0 flex-1 overflow-auto">
      <div className="flex h-full min-w-[1024px] flex-col">
        <Tabs
          className="min-h-0 flex-1 flex-row"
          value={workspacePanelTab}
          orientation="vertical"
          onValueChange={handleWorkspacePanelTabChange}
        >
          <WorkspaceActivityBar
            currentVisible={sidebarVisible}
            onSelectTab={selectWorkspacePanelTab}
          />
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
                    <WorkspaceSidebarHeader
                      tab={workspacePanelTab}
                      treeState={treeState}
                      visibleTreeItemCount={currentVisibleTreeItemCount}
                    />
                    <TabsContent keepMounted value="files">
                      <WorkspaceTreePane
                        key={rootFolder.path}
                        rootPath={rootFolder.path}
                        state={treeState}
                        onVisibleItemCountChange={
                          handleVisibleTreeItemCountChange
                        }
                        onLoadDirectory={onLoadDirectory}
                      />
                    </TabsContent>
                    <TabsContent keepMounted value="search">
                      <WorkspaceSearchPane rootPath={rootFolder.path} />
                    </TabsContent>
                    <TabsContent keepMounted value="git">
                      <GitPanel rootPath={rootFolder.path} />
                    </TabsContent>
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
        </Tabs>
        <div className="min-w-0">
          <EditorStatusBar status={statusBarState} />
        </div>
      </div>
    </div>
  )
}

function isWorkspacePanelTab(value: string): value is WorkspacePanelTab {
  return value === "files" || value === "git" || value === "search"
}

type VisibleTreeItemCountSnapshot = {
  count: number
  rootPath: string
}

function WorkspaceSidebarHeader({
  tab,
  treeState,
  visibleTreeItemCount,
}: {
  tab: WorkspacePanelTab
  treeState: LoadState<TreeModel>
  visibleTreeItemCount: number | null
}) {
  const title = workspacePanelTabTitle(tab)
  const detail =
    tab === "files"
      ? workspaceTreeHeaderDetail(treeState, visibleTreeItemCount)
      : null

  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
      <div className="min-w-0">
        <div className="truncate text-xs font-medium">{title}</div>
        {detail && (
          <div className="truncate text-[11px] text-muted-foreground">
            {detail}
          </div>
        )}
      </div>
    </div>
  )
}

function workspacePanelTabTitle(tab: WorkspacePanelTab) {
  if (tab === "files") return "Files"
  if (tab === "search") return "Search"

  return "Git"
}

function workspaceTreeHeaderDetail(
  state: LoadState<TreeModel>,
  visibleTreeItemCount: number | null
) {
  if (state.status === "ready" && visibleTreeItemCount !== null) {
    return visibleTreeItemCountLabel(visibleTreeItemCount)
  }
  if (state.status === "error") return "Could not load"
  if (state.status === "loading") return "Loading"

  return null
}

function visibleTreeItemCountLabel(count: number) {
  const noun = count === 1 ? "item" : "items"

  return `${count.toLocaleString()} visible ${noun}`
}

function WorkspaceActivityBar({
  currentVisible,
  onSelectTab,
}: {
  currentVisible: boolean
  onSelectTab: (tab: WorkspacePanelTab) => void
}) {
  return (
    <TabsList
      aria-label="Workspace activity"
      className="h-full w-10 flex-col items-stretch justify-start gap-1 border-r border-b-0 border-border bg-background px-1 py-2"
    >
      <WorkspaceActivityTab
        icon={<FolderIcon className="size-5" />}
        label="Files"
        value="files"
        currentVisible={currentVisible}
        onSelectTab={onSelectTab}
      />
      <WorkspaceActivityTab
        icon={<MagnifyingGlassIcon className="size-5" />}
        label="Search"
        value="search"
        currentVisible={currentVisible}
        onSelectTab={onSelectTab}
      />
      <WorkspaceActivityTab
        icon={<GitBranchIcon className="size-5" />}
        label="Git"
        value="git"
        currentVisible={currentVisible}
        onSelectTab={onSelectTab}
      />
    </TabsList>
  )
}

function WorkspaceActivityTab({
  currentVisible,
  icon,
  label,
  onSelectTab,
  value,
}: {
  currentVisible: boolean
  icon: ReactNode
  label: string
  onSelectTab: (tab: WorkspacePanelTab) => void
  value: WorkspacePanelTab
}) {
  return (
    <TabsTrigger
      aria-label={label}
      className={cn(
        "h-10 w-full flex-none flex-col rounded-md px-0 text-muted-foreground hover:bg-muted/50 data-active:shadow-none",
        currentVisible
          ? "data-active:bg-accent data-active:text-accent-foreground"
          : "data-active:bg-transparent data-active:text-muted-foreground"
      )}
      title={label}
      value={value}
      onClick={() => onSelectTab(value)}
    >
      {icon}
      <span className="sr-only">{label}</span>
    </TabsTrigger>
  )
}

function WorkspaceTreePane({
  onVisibleItemCountChange,
  rootPath,
  state,
  onLoadDirectory,
}: {
  onVisibleItemCountChange: (count: number) => void
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
      onVisibleItemCountChange={onVisibleItemCountChange}
      onLoadDirectory={onLoadDirectory}
    />
  )
}
