import { FileNavigatorBody } from '@/features/shell-proof/components/file-navigator-body'
import { SurfaceIcon } from '@/features/workbench/components/surface-icon'
import type { Surface } from '@workspace/tiling/utils/layout-types'

export function SurfaceBody({ surface }: { readonly surface: Surface }) {
  if (surface.type === 'file-navigator') return <FileNavigatorBody />

  return (
    <div className='bg-background/60 flex h-full min-h-0 flex-col gap-4 p-4'>
      <div className='flex min-w-0 items-center gap-3'>
        <div className='bg-muted text-muted-foreground border-border grid size-10 shrink-0 place-items-center rounded-md border'>
          <SurfaceIcon className='size-5' type={surface.type} />
        </div>
        <div className='min-w-0'>
          <div className='truncate text-sm font-medium'>{surface.title}</div>
          <div className='text-muted-foreground truncate text-xs'>{surface.type}</div>
        </div>
      </div>
      <div className='grid min-h-0 flex-1 gap-3 overflow-hidden'>
        <div className='bg-muted/50 h-6 rounded-sm' />
        <div className='bg-muted/40 h-6 w-4/5 rounded-sm' />
        <div className='bg-muted/30 border-border min-h-0 flex-1 rounded-sm border' />
      </div>
    </div>
  )
}
