import { LogsPanel } from '@/features/logs/panel'

import { PanelUnavailable } from '@/features/workbench/components/panel-unavailable'
import type { SurfaceRendererProps } from '@/features/workbench/utils/surface-renderer-registry'
import { ToolPaneHeader } from '@/features/workbench/components/tool-pane-header'

export function LogsSurface({ active, surface, visible }: SurfaceRendererProps) {
  if (surface.type !== 'logs') {
    return <PanelUnavailable message='This surface is not logs.' />
  }

  return (
    <section className='bg-background flex h-full min-h-0 min-w-0 flex-col overflow-hidden'>
      <ToolPaneHeader tab='logs' />
      <div className='min-h-0 min-w-0 flex-1 overflow-hidden'>
        <LogsPanel active={active && visible} />
      </div>
    </section>
  )
}
