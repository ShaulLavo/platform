import { PanelUnavailable } from '@/features/workbench/components/panel-unavailable'
import type { SurfaceRendererProps } from '@/features/workbench/utils/surface-renderer-registry'

export function SearchPreviewSurface({ surface }: SurfaceRendererProps) {
  if (surface.type !== 'search-preview') {
    return <PanelUnavailable message='This surface is not a search preview.' />
  }

  return (
    <section
      aria-label={surface.title}
      className='bg-background flex h-full min-h-0 min-w-0 flex-col overflow-hidden'
      data-search-preview-surface=''
    >
      <header className='border-border/70 bg-muted/20 shrink-0 border-b px-4 py-2'>
        <h2 className='text-foreground truncate text-sm font-medium'>{surface.title}</h2>
      </header>
      <div className='text-muted-foreground min-h-0 flex-1 overflow-auto p-4 text-sm'>
        {surface.resourceKey ? (
          <p className='text-foreground font-mono text-xs'>{surface.resourceKey}</p>
        ) : (
          <p>No preview resource is available.</p>
        )}
      </div>
    </section>
  )
}
