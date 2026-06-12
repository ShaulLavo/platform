import { ArrowClockwiseIcon, EyeIcon, EyeSlashIcon } from '@phosphor-icons/react'

import { useLayoutState } from '@/features/workbench/hooks/use-layout-state'
import { visibleWindowIdsInOrder } from '@workspace/tiling/utils/layout-normalize'
import { Button } from '@workspace/ui/components/button'

export function Toolbar({
  dropZonesVisible,
  onReset,
  onToggleDropZones,
}: {
  readonly dropZonesVisible: boolean
  readonly onReset: () => void
  readonly onToggleDropZones: () => void
}) {
  const layout = useLayoutState((state) => state.layout)
  const windowIds = visibleWindowIdsInOrder(layout)
  const surfaceCount = windowIds.reduce((count, windowId) => {
    const window = layout.windowsById[windowId]
    if (!window) return count

    return count + window.surfaceIds.length
  }, 0)
  const DropZonesIcon = dropZonesVisible ? EyeSlashIcon : EyeIcon
  const dropZonesLabel = dropZonesVisible ? 'Hide zones' : 'Show zones'

  return (
    <header className='border-border flex h-16 shrink-0 items-center justify-between border-b px-4'>
      <div className='min-w-0'>
        <h1 className='truncate text-sm font-medium'>Shell tiling proof</h1>
        <p className='text-muted-foreground text-xs tabular-nums'>
          {windowIds.length} windows / {surfaceCount} tabs
        </p>
      </div>
      <div className='flex shrink-0 items-center gap-2'>
        <Button
          aria-pressed={dropZonesVisible}
          size='sm'
          type='button'
          variant='outline'
          onClick={onToggleDropZones}
        >
          <DropZonesIcon className='size-3.5' />
          {dropZonesLabel}
        </Button>
        <Button size='sm' type='button' variant='outline' onClick={onReset}>
          <ArrowClockwiseIcon className='size-3.5' />
          Reset
        </Button>
      </div>
    </header>
  )
}
