import { FilesPane } from '@/components/workspace/file-tree/components/files-pane'

import { PanelUnavailable } from '@/features/workbench/components/panel-unavailable'
import type { SurfaceRendererProps } from '@/features/workbench/utils/surface-renderer-registry'
import { ToolPaneHeader } from '@/features/workbench/components/tool-pane-header'
import { useEditorSurfaceContext } from '@/features/workbench/hooks/use-editor-surface-context'

export function FileNavigatorSurface({ surface }: SurfaceRendererProps) {
  const { rootPath, toolSurfaceState } = useEditorSurfaceContext()
  if (surface.type !== 'file-navigator') {
    return <PanelUnavailable message='This surface is not a file navigator.' />
  }
  if (!toolSurfaceState) {
    return <PanelUnavailable message='File navigator state is unavailable.' />
  }

  return (
    <section className='bg-background flex h-full min-h-0 min-w-0 flex-col overflow-hidden'>
      <ToolPaneHeader
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
