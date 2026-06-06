import { LogsPanel } from '@/features/logs/panel'

import { PanelUnavailable } from '@/features/workbench/components/panel-unavailable'
import type { SurfaceRendererProps } from '@/features/workbench/utils/surface-renderer-registry'
import { ToolPaneHeader } from '@/features/workbench/components/tool-pane-header'
import { useEditorSurfaceContext } from '@/features/workbench/hooks/use-editor-surface-context'

export function LogsSurface({ active, surface, visible }: SurfaceRendererProps) {
  const { toolSurfaceState } = useEditorSurfaceContext()
  if (surface.type !== 'logs') {
    return <PanelUnavailable message='This surface is not logs.' />
  }
  if (!toolSurfaceState) {
    return <PanelUnavailable message='Logs state is unavailable.' />
  }

  return (
    <section className='bg-background flex h-full min-h-0 min-w-0 flex-col overflow-hidden'>
      <ToolPaneHeader
        tab='logs'
        treeState={toolSurfaceState.treeState}
        visibleTreeItemCount={toolSurfaceState.visibleTreeItemCount}
      />
      <div className='min-h-0 min-w-0 flex-1 overflow-hidden'>
        <LogsPanel active={active && visible} />
      </div>
    </section>
  )
}
