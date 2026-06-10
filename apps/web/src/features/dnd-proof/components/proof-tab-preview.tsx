import type { Surface } from '@workspace/tiling/utils/layout-types'
import { cn } from '@workspace/ui/lib/utils'

export function ProofTabPreview({
  orientation,
  surface,
}: {
  readonly orientation: 'horizontal' | 'vertical'
  readonly surface: Surface
}) {
  return (
    <div
      aria-hidden='true'
      className={cn(
        'pointer-events-none flex shrink-0 items-center border border-dashed border-info/50 bg-info/10 text-info text-xs shadow-sm',
        orientation === 'vertical'
          ? 'h-24 w-8 flex-col gap-1 rounded-md px-1 py-2'
          : 'h-9 w-28 min-w-20 max-w-44 gap-1.5 rounded-t-md px-2',
      )}
      data-proof-tab-preview-id={surface.id}
      data-proof-tab-preview-kind='ghost'
    >
      <span className='bg-info size-2 rounded-full' />
      <span
        className={cn(
          'min-w-0 flex-1 truncate',
          orientation === 'vertical' && 'min-h-0 [writing-mode:vertical-rl]',
        )}
      >
        {surface.title}
      </span>
    </div>
  )
}
