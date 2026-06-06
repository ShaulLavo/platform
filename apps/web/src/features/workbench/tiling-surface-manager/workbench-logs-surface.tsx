import { LogsPanel } from '@/features/logs/panel'

import { WorkbenchPanelUnavailable } from '../workbench-panel-unavailable'
import type { WorkbenchSurfaceRendererProps } from './surface-renderer-registry'
import { ToolPaneHeader } from './tool-pane-header'
import { useWorkbenchEditorSurfaceContext } from './use-workbench-editor-surface-context'

export function WorkbenchLogsSurface({ active, surface, visible }: WorkbenchSurfaceRendererProps) {
  const { toolSurfaceState } = useWorkbenchEditorSurfaceContext()
  if (surface.type !== 'logs') {
    return <WorkbenchPanelUnavailable message='This surface is not logs.' />
  }
  if (!toolSurfaceState) {
    return <WorkbenchPanelUnavailable message='Logs state is unavailable.' />
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
