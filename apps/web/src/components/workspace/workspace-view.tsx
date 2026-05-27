import type { RequestCloseTab, RequestCloseTabs } from '@/features/editor/hooks/use-dirty-tab-close'
import { FileViewer } from '@/components/workspace/file-viewer'
import { useWorkspaceTerminalState } from '@/components/workspace/use-workspace-terminal-state'
import { WorkspaceActivityBar } from '@/components/workspace/workspace-activity-bar'
import { WorkspaceSidebarResizablePanel } from '@/components/workspace/workspace-sidebar-resizable-panel'
import { WorkspaceStatusBar } from '@/components/workspace/workspace-status-bar'
import { workspaceResizableStorageKey } from '@/components/workspace/workspace-view-utils'
import { TerminalPanel } from '@/features/terminal/terminal-panel'
import type { PickedFsEntry, TreeEntry } from '@/lib/file-system-types'
import type { LoadState } from '@/lib/load-state'
import type { DirectoryLoadOptions, TreeModel } from '@/lib/tree-model'
import type { EditorKeymapLayer } from '@editor/core'
import {
  PersistedResizablePanelGroup,
  ResizableHandle,
  ResizablePanel,
} from '@workspace/ui/components/resizable'
import { memo } from 'react'

type WorkspaceViewProps = {
  editorKeymapLayers: readonly EditorKeymapLayer[]
  rootFolder: PickedFsEntry
  treeState: LoadState<TreeModel>
  onLoadDirectory: (entry: TreeEntry, treePath: string, options?: DirectoryLoadOptions) => void
  onPrefetchDirectory: (entry: TreeEntry, treePath: string) => void
  onRequestCloseTab: RequestCloseTab
  onRequestCloseTabs: RequestCloseTabs
}

export const WorkspaceView = memo(function WorkspaceView({
  editorKeymapLayers,
  rootFolder,
  treeState,
  onLoadDirectory,
  onPrefetchDirectory,
  onRequestCloseTab,
  onRequestCloseTabs,
}: WorkspaceViewProps) {
  const rootPath = rootFolder.path
  const { handleTerminalResize, handleToggleTerminal, terminalCollapsed, terminalPanelRef } =
    useWorkspaceTerminalState()

  return (
    <div className='h-full min-h-0 flex-1 overflow-auto'>
      <div className='flex h-full min-w-[1024px] flex-col'>
        <div className='flex min-h-0 flex-1 flex-row gap-0'>
          <WorkspaceActivityBar
            terminalCollapsed={terminalCollapsed}
            onToggleTerminal={handleToggleTerminal}
          />
          <PersistedResizablePanelGroup
            className='min-h-0 flex-1'
            orientation='horizontal'
            storageKey={workspaceResizableStorageKey(rootPath, 'main')}
          >
            <WorkspaceSidebarResizablePanel
              rootPath={rootPath}
              treeReady={treeState.status === 'ready'}
              treeState={treeState}
              onLoadDirectory={onLoadDirectory}
              onPrefetchDirectory={onPrefetchDirectory}
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
        </div>
        <div className='min-w-0'>
          <WorkspaceStatusBar />
        </div>
      </div>
    </div>
  )
})
