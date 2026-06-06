import type { RequestCloseTab, RequestCloseTabs } from '@/features/editor/hooks/use-dirty-tab-close'
import { TerminalStateProvider } from '@/components/workspace/terminal/providers/terminal-state-provider'
import { SearchRuntime } from '@/components/workspace/search/components/search-runtime'
import { WorkbenchEditorSurfaceLayoutView } from '@/features/workbench/tiling-surface-manager/workbench-editor-surface-layout-view'
import type { PickedFsEntry, TreeEntry } from '@/lib/file-system-types'
import type { LoadState } from '@/lib/load-state'
import type { DirectoryLoadOptions, TreeModel } from '@/lib/tree-model'
import type { EditorKeymapLayer } from '@editor/core'
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
            <div className='relative min-h-0 flex-1 overflow-hidden' data-terminal-overlay-bounds>
              <WorkbenchEditorSurfaceLayoutView
                editorKeymapLayers={editorKeymapLayers}
                rootPath={rootPath}
                treeState={treeState}
                onLoadDirectory={onLoadDirectory}
                onPrefetchDirectory={onPrefetchDirectory}
                onRequestCloseTab={onRequestCloseTab}
                onRequestCloseTabs={onRequestCloseTabs}
              />
            </div>
          </div>
        </div>
      </TerminalStateProvider>
    )
  },
)
