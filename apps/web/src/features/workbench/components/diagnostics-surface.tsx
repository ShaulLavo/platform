import { PanelUnavailable } from '@/features/workbench/components/panel-unavailable'
import type { SurfaceRendererProps } from '@/features/workbench/utils/surface-renderer-registry'

export function DiagnosticsSurface({ surface }: SurfaceRendererProps) {
  if (surface.type !== 'diagnostics') {
    return <PanelUnavailable message='This surface is not diagnostics.' />
  }

  return (
    <section className='bg-background flex h-full min-h-0 min-w-0 flex-col overflow-hidden'>
      <header className='flex h-10 shrink-0 items-center gap-2 border-b px-3'>
        <div className='truncate text-xs font-medium'>Problems</div>
      </header>
      <div className='text-muted-foreground grid min-h-0 flex-1 place-items-center p-4 text-xs'>
        No problems reported
      </div>
    </section>
  )
}
