import { SearchPane } from '@/components/workspace/search/components/search-pane'

import { PanelUnavailable } from '@/features/workbench/components/panel-unavailable'
import type { SurfaceRendererProps } from '@/features/workbench/utils/surface-renderer-registry'
import { ToolPaneHeader } from '@/features/workbench/components/tool-pane-header'
import { useEditorSurfaceContext } from '@/features/workbench/hooks/use-editor-surface-context'

export function SearchResultsSurface({ surface }: SurfaceRendererProps) {
  const { rootPath, toolSurfaceState } = useEditorSurfaceContext()
  if (surface.type !== 'search-results') {
    return <PanelUnavailable message='This surface is not search results.' />
  }
  if (!toolSurfaceState) {
    return <PanelUnavailable message='Search state is unavailable.' />
  }

  return (
    <section className='bg-background flex h-full min-h-0 min-w-0 flex-col overflow-hidden'>
      <ToolPaneHeader
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
