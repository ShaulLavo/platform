import { FilesPane } from '@/components/workspace/file-tree/components/files-pane'
import { SidebarHeader } from '@/components/workspace/sidebar/components/sidebar-header'

import { WorkbenchPanelUnavailable } from '../workbench-panel-unavailable'
import type { WorkbenchSurfaceRendererProps } from './surface-renderer-registry'
import { useWorkbenchEditorSurfaceContext } from './use-workbench-editor-surface-context'

export function WorkbenchFileNavigatorSurface({ surface }: WorkbenchSurfaceRendererProps) {
  const { rootPath, toolSurfaceState } = useWorkbenchEditorSurfaceContext()
  if (surface.type !== 'file-navigator') {
    return <WorkbenchPanelUnavailable message='This surface is not a file navigator.' />
  }
  if (!toolSurfaceState) {
    return <WorkbenchPanelUnavailable message='File navigator state is unavailable.' />
  }

  return (
    <section className='bg-background flex h-full min-h-0 min-w-0 flex-col overflow-hidden'>
      <SidebarHeader
        tab='files'
        treeState={toolSurfaceState.treeState}
        visibleTreeItemCount={toolSurfaceState.visibleTreeItemCount}
      />
      <div className='min-h-0 min-w-0 flex-1 overflow-hidden'>
        <FilesPane
          key={rootPath}
          rootPath={rootPath}
          state={toolSurfaceState.treeState}
          onVisibleItemCountChange={toolSurfaceState.onVisibleTreeItemCountChange}
          onLoadDirectory={toolSurfaceState.onLoadDirectory}
          onPrefetchDirectory={toolSurfaceState.onPrefetchDirectory}
        />
      </div>
    </section>
  )
}
