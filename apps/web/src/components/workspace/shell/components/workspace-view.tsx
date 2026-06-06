import type { RequestCloseTab, RequestCloseTabs } from '@/features/editor/hooks/use-dirty-tab-close'
import { TerminalStateProvider } from '@/components/workspace/terminal/providers/terminal-state-provider'
import { ActivityBar } from '@/components/workspace/activity-bar/components/activity-bar'
import { FloatingTerminal } from '@/components/workspace/terminal/components/floating-terminal'
import { SearchRuntime } from '@/components/workspace/search/components/search-runtime'
import { SidebarResizablePanel } from '@/components/workspace/sidebar/components/sidebar-resizable-panel'
import { resizableStorageKey } from '@/components/workspace/shell/utils/workspace-view-utils'
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
      <TerminalStateProvider>
        <SearchRuntime rootPath={rootPath} />
        <div className='h-full min-h-0 flex-1 overflow-auto'>
          <div className='flex h-full min-w-[1024px] flex-col'>
            <div className='flex min-h-0 flex-1 flex-row gap-0'>
              <ActivityBar />
              <PersistedResizablePanelGroup
                className='min-h-0 flex-1'
                orientation='horizontal'
                storageKey={resizableStorageKey(rootPath, 'main')}
              >
                <SidebarResizablePanel
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
                    <FloatingTerminal rootPath={rootPath} />
                  </div>
                </ResizablePanel>
              </PersistedResizablePanelGroup>
            </div>
          </div>
        </div>
      </TerminalStateProvider>
    )
  },
)
