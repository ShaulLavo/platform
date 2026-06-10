import type { RequestCloseTab, RequestCloseTabs } from '@/features/editor/hooks/use-dirty-tab-close'
import { SearchRuntime } from '@/components/workspace/search/components/search-runtime'
import { EditorSurfaceLayoutView } from '@/features/workbench/components/editor-surface-layout-view'
import type { PickedFsEntry } from '@/lib/file-system-types'
import type { EditorKeymapLayer } from '@singapor/core'
import { memo } from 'react'

type WorkspaceViewProps = {
  editorKeymapLayers: readonly EditorKeymapLayer[]
  rootFolder: PickedFsEntry
  onRequestCloseTab: RequestCloseTab
  onRequestCloseTabs: RequestCloseTabs
}

export const WorkspaceView = memo(
  ({
    editorKeymapLayers,
    rootFolder,
    onRequestCloseTab,
    onRequestCloseTabs,
  }: WorkspaceViewProps) => {
    const rootPath = rootFolder.path

    return (
      <>
        <SearchRuntime rootPath={rootPath} />
        <div className='h-full min-h-0 flex-1 overflow-auto'>
          <div className='flex h-full min-w-[1024px] flex-col'>
            <div className='relative min-h-0 flex-1 overflow-hidden' data-terminal-overlay-bounds>
              <EditorSurfaceLayoutView
                editorKeymapLayers={editorKeymapLayers}
                rootPath={rootPath}
                onRequestCloseTab={onRequestCloseTab}
                onRequestCloseTabs={onRequestCloseTabs}
              />
            </div>
          </div>
        </div>
      </>
    )
  },
)
