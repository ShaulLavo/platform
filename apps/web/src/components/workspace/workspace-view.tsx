import type { RequestCloseTab, RequestCloseTabs } from '@/features/editor/hooks/use-dirty-tab-close'
import { WorkspaceTerminalStateProvider } from '@/components/workspace/workspace-terminal-state-provider'
import { WorkspaceActivityBar } from '@/components/workspace/workspace-activity-bar'
import { WorkspaceFloatingTerminal } from '@/components/workspace/workspace-floating-terminal'
import { WorkspaceSearchRuntime } from '@/components/workspace/workspace-search-runtime'
import { WorkspaceSidebarResizablePanel } from '@/components/workspace/workspace-sidebar-resizable-panel'
import { workspaceResizableStorageKey } from '@/components/workspace/workspace-view-utils'
import { WorkbenchEditorSurfaceLayoutView } from '@/features/workbench/tiling-surface-manager/workbench-editor-surface-layout-view'
import type { PickedFsEntry, TreeEntry } from '@/lib/file-system-types'
import type { LoadState } from '@/lib/load-state'
import type { DirectoryLoadOptions, TreeModel } from '@/lib/tree-model'
import type { EditorKeymapLayer } from '@editor/core'
import { PersistedResizablePanelGroup, ResizablePanel } from '@workspace/ui/components/resizable'
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

export const WorkspaceView = memo(
  ({
    editorKeymapLayers,
    rootFolder,
    treeState,
    onLoadDirectory,
    onPrefetchDirectory,
    onRequestCloseTab,
    onRequestCloseTabs,
  }: WorkspaceViewProps) => {
    const rootPath = rootFolder.path

    return (
      <WorkspaceTerminalStateProvider>
        <WorkspaceSearchRuntime rootPath={rootPath} />
        <div className='h-full min-h-0 flex-1 overflow-auto'>
          <div className='flex h-full min-w-[1024px] flex-col'>
            <div className='flex min-h-0 flex-1 flex-row gap-0'>
              <WorkspaceActivityBar />
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
                  <div
                    className='relative h-full min-h-0 min-w-0 overflow-hidden'
                    data-terminal-overlay-bounds
                  >
                    <WorkbenchEditorSurfaceLayoutView
                      editorKeymapLayers={editorKeymapLayers}
                      rootPath={rootPath}
                      onRequestCloseTab={onRequestCloseTab}
                      onRequestCloseTabs={onRequestCloseTabs}
                    />
                    <WorkspaceFloatingTerminal rootPath={rootPath} />
                  </div>
                </ResizablePanel>
              </PersistedResizablePanelGroup>
            </div>
          </div>
        </div>
      </WorkspaceTerminalStateProvider>
    )
  },
)
