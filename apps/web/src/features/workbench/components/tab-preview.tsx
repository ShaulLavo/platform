import { tilingTabPreviewAttributes } from '@workspace/tiling/utils/dom-attributes'
import type { Surface } from '@workspace/tiling/utils/layout-types'
import { cn } from '@workspace/ui/lib/utils'

// Styled to match a native in-strip sort source: a regular tab dimmed to 45%
// with the info ring, so cross-window insertion previews read the same as
// reordering a tab inside its own strip.
export function TabPreview({
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
        'border-border bg-background text-foreground ring-info pointer-events-none flex shrink-0 items-center border text-xs opacity-45 shadow-sm ring-2',
        orientation === 'vertical'
          ? 'h-24 w-8 flex-col gap-1 rounded-md px-1 py-2'
          : 'h-9 w-28 min-w-20 max-w-44 gap-1.5 rounded-t-md px-2',
      )}
      data-workbench-tab-preview-id={surface.id}
      data-workbench-tab-preview-kind='ghost'
      {...tilingTabPreviewAttributes()}
    >
      <span className='bg-primary size-2 rounded-full' />
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
