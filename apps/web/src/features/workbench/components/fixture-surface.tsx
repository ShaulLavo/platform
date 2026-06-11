import { SurfaceIcon } from '@/features/workbench/components/surface-icon'
import type { SurfaceRendererProps } from '@/features/workbench/utils/surface-renderer-registry'

export function FixtureSurface({ active, surface, visible }: SurfaceRendererProps) {
  return (
    <section
      aria-label={surface.title}
      className='bg-background flex h-full min-h-0 min-w-0 flex-col overflow-hidden'
      data-active={active ? 'true' : 'false'}
      data-surface-renderer='fixture'
      data-visible={visible ? 'true' : 'false'}
    >
      <div className='border-border/70 bg-muted/20 flex min-h-0 flex-1 items-center justify-center border-t p-6'>
        <div className='border-border/70 bg-background backdrop-material grid w-full max-w-md gap-4 rounded-md border p-5'>
          <div className='flex min-w-0 items-center gap-3'>
            <div className='bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-md'>
              <SurfaceIcon className='size-5' type={surface.type} />
            </div>
            <div className='min-w-0'>
              <h3 className='text-foreground truncate text-sm leading-5 font-medium'>
                {surface.title}
              </h3>
              <p className='text-muted-foreground truncate text-xs'>{surface.type}</p>
            </div>
          </div>
          <dl className='text-muted-foreground grid gap-2 text-xs'>
            <div className='flex min-w-0 items-center justify-between gap-3'>
              <dt className='shrink-0'>Lifecycle</dt>
              <dd className='text-foreground truncate font-mono'>{surface.lifecycle}</dd>
            </div>
            <div className='flex min-w-0 items-center justify-between gap-3'>
              <dt className='shrink-0'>State</dt>
              <dd className='text-foreground truncate font-mono'>{surfaceStateLabel(surface)}</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  )
}

function surfaceStateLabel(surface: SurfaceRendererProps['surface']) {
  if (surface.resourceKey) return surface.resourceKey
  if (surface.stateKey) return surface.stateKey

  return surface.id
}
