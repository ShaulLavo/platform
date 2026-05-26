import type { RequestCloseTab, RequestCloseTabs } from '@/features/editor/hooks/use-dirty-tab-close'
import { FileViewer } from '@/components/workspace/file-viewer'
import { WorkspaceActivityBar } from '@/components/workspace/workspace-activity-bar'
import { WorkspaceSidebar } from '@/components/workspace/workspace-sidebar'
import { WorkspaceStatusBar } from '@/components/workspace/workspace-status-bar'
import { useWorkspaceViewState } from '@/components/workspace/use-workspace-view-state'
import { workspaceResizableStorageKey } from '@/components/workspace/workspace-view-utils'
import { TerminalPanel } from '@/features/terminal/terminal-panel'
import type { PickedFsEntry, TreeEntry } from '@/lib/file-system-types'
import type { LoadState } from '@/lib/load-state'
import type { DirectoryLoadOptions, TreeModel } from '@/lib/tree-model'
import type { EditorKeymapLayer } from '@editor/core'
import { Tabs } from '@workspace/ui/components/tabs'
import {
  PersistedResizablePanelGroup,
  ResizableHandle,
  ResizablePanel,
} from '@workspace/ui/components/resizable'

type WorkspaceViewProps = {
  editorKeymapLayers: readonly EditorKeymapLayer[]
  rootFolder: PickedFsEntry
  treeState: LoadState<TreeModel>
  onLoadDirectory: (entry: TreeEntry, treePath: string, options?: DirectoryLoadOptions) => void
  onPrefetchDirectory: (entry: TreeEntry, treePath: string) => void
  onRequestCloseTab: RequestCloseTab
  onRequestCloseTabs: RequestCloseTabs
}

export function WorkspaceView({
  editorKeymapLayers,
  rootFolder,
  treeState,
  onLoadDirectory,
  onPrefetchDirectory,
  onRequestCloseTab,
  onRequestCloseTabs,
}: WorkspaceViewProps) {
  const rootPath = rootFolder.path
  const {
    currentVisibleTreeItemCount,
    handleSidebarResize,
    handleTerminalResize,
    handleToggleTerminal,
    handleVisibleTreeItemCountChange,
    handleWorkspacePanelTabChange,
    selectWorkspacePanelTab,
    sidebarPanelRef,
    sidebarVisible,
    terminalCollapsed,
    terminalPanelRef,
    workspacePanelTab,
  } = useWorkspaceViewState({
    rootPath,
    treeReady: treeState.status === 'ready',
  })
  const selectedWorkspacePanelTab = sidebarVisible ? workspacePanelTab : ''

  return (
    <div className='h-full min-h-0 flex-1 overflow-auto'>
      <div className='flex h-full min-w-[1024px] flex-col'>
        <Tabs
          className='min-h-0 flex-1 flex-row gap-0'
          value={selectedWorkspacePanelTab}
          orientation='vertical'
          onValueChange={handleWorkspacePanelTabChange}
        >
          <WorkspaceActivityBar
            currentVisible={sidebarVisible}
            terminalCollapsed={terminalCollapsed}
            onSelectTab={selectWorkspacePanelTab}
            onToggleTerminal={handleToggleTerminal}
          />
          <PersistedResizablePanelGroup
            className='min-h-0 flex-1'
            orientation='horizontal'
            storageKey={workspaceResizableStorageKey(rootPath, 'main')}
          >
            <ResizablePanel
              id='workspace-sidebar'
              className='min-h-0 min-w-0 overflow-hidden'
              collapsible
              collapsedSize='0px'
              defaultSize={sidebarVisible ? '320px' : '0px'}
              minSize='240px'
              maxSize='50%'
              groupResizeBehavior='preserve-pixel-size'
              panelRef={sidebarPanelRef}
              onResize={handleSidebarResize}
            >
              <WorkspaceSidebar
                rootPath={rootPath}
                sidebarVisible={sidebarVisible}
                tab={workspacePanelTab}
                treeState={treeState}
                visibleTreeItemCount={currentVisibleTreeItemCount}
                onVisibleItemCountChange={handleVisibleTreeItemCountChange}
                onLoadDirectory={onLoadDirectory}
                onPrefetchDirectory={onPrefetchDirectory}
              />
            </ResizablePanel>
            <ResizableHandle
              aria-label='Resize workspace sidebar'
              className={sidebarVisible ? undefined : '-mr-px'}
              withHandle
            />
            <ResizablePanel
              id='workspace-editor'
              className='h-full min-h-0 min-w-0 overflow-hidden'
              minSize='480px'
            >
              <PersistedResizablePanelGroup
                className='min-h-0 min-w-0'
                orientation='vertical'
                storageKey={workspaceResizableStorageKey(rootPath, 'editor')}
              >
                <ResizablePanel
                  id='workspace-editor-surface'
                  className='min-h-0 min-w-0 overflow-hidden'
                  defaultSize='70%'
                  minSize='240px'
                >
                  <FileViewer
                    editorKeymapLayers={editorKeymapLayers}
                    rootPath={rootPath}
                    onRequestCloseTab={onRequestCloseTab}
                    onRequestCloseTabs={onRequestCloseTabs}
                  />
                </ResizablePanel>
                <ResizableHandle aria-label='Resize terminal' withHandle />
                <ResizablePanel
                  id='workspace-terminal'
                  className='min-h-0 min-w-0 overflow-hidden'
                  collapsible
                  collapsedSize='0px'
                  defaultSize='30%'
                  minSize='160px'
                  maxSize='65%'
                  groupResizeBehavior='preserve-pixel-size'
                  panelRef={terminalPanelRef}
                  onResize={handleTerminalResize}
                >
                  <TerminalPanel
                    aria-hidden={terminalCollapsed}
                    inert={terminalCollapsed}
                    rootPath={rootPath}
                  />
                </ResizablePanel>
              </PersistedResizablePanelGroup>
            </ResizablePanel>
          </PersistedResizablePanelGroup>
        </Tabs>
        <div className='min-w-0'>
          <WorkspaceStatusBar />
        </div>
      </div>
    </div>
  )
}
