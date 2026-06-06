import { SearchPane } from '@/components/workspace/search/components/search-pane'
import { SidebarHeader } from '@/components/workspace/sidebar/components/sidebar-header'

import { WorkbenchPanelUnavailable } from '../workbench-panel-unavailable'
import type { WorkbenchSurfaceRendererProps } from './surface-renderer-registry'
import { useWorkbenchEditorSurfaceContext } from './use-workbench-editor-surface-context'

export function WorkbenchSearchResultsSurface({ surface }: WorkbenchSurfaceRendererProps) {
  const { rootPath, toolSurfaceState } = useWorkbenchEditorSurfaceContext()
  if (surface.type !== 'search-results') {
    return <WorkbenchPanelUnavailable message='This surface is not search results.' />
  }
  if (!toolSurfaceState) {
    return <WorkbenchPanelUnavailable message='Search state is unavailable.' />
  }

  return (
    <section className='bg-background flex h-full min-h-0 min-w-0 flex-col overflow-hidden'>
      <SidebarHeader
        tab='search'
        treeState={toolSurfaceState.treeState}
        visibleTreeItemCount={toolSurfaceState.visibleTreeItemCount}
      />
      <div className='min-h-0 min-w-0 flex-1 overflow-hidden'>
        <SearchPane rootPath={rootPath} />
      </div>
    </section>
  )
}
