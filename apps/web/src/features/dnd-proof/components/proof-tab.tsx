import { useSortable } from '@dnd-kit/react/sortable'
import { XIcon } from '@phosphor-icons/react'

import {
  TILING_TAB_TYPE,
  tabDragId,
  type TilingDragData,
  type TilingDropData,
} from '@workspace/tiling/utils/drag-data'
import type { Surface, SurfaceId, WindowId } from '@workspace/tiling/utils/layout-types'
import { tilingTabAttributes } from '@workspace/tiling/utils/dom-attributes'
import { Button } from '@workspace/ui/components/button'
import { cn } from '@workspace/ui/lib/utils'

export function ProofTab({
  acceptsTabDrops,
  actionsVisible = true,
  active,
  dropZonesVisible,
  index,
  optimisticSorting,
  orientation,
  previewAdded,
  surface,
  windowId,
  onClose,
  onSelect,
}: {
  readonly acceptsTabDrops: boolean
  readonly actionsVisible?: boolean
  readonly active: boolean
  readonly dropZonesVisible: boolean
  readonly index: number
  readonly optimisticSorting: boolean
  readonly orientation: 'horizontal' | 'vertical'
  readonly previewAdded: boolean
  readonly surface: Surface
  readonly windowId: WindowId
  readonly onClose: (surfaceId: SurfaceId) => void
  readonly onSelect: (surfaceId: SurfaceId) => void
}) {
  const data: TilingDragData & TilingDropData = {
    index,
    kind: 'tab',
    surfaceId: surface.id,
    windowId,
  }
  const { handleRef, isDragSource, isDragging, isDropTarget, ref, sourceRef } = useSortable<
    TilingDragData & TilingDropData
  >({
    accept: acceptsTabDrops ? TILING_TAB_TYPE : [],
    data,
    group: windowId,
    id: tabDragId(surface.id),
    index,
    plugins: optimisticSorting ? undefined : [],
    type: TILING_TAB_TYPE,
  })

  function selectSurface() {
    if (isDragging) return

    onSelect(surface.id)
  }

  return (
    <div
      aria-selected={active}
      className={cn(
        'group/proof-tab flex shrink-0 cursor-grab items-center border text-xs shadow-sm active:cursor-grabbing',
        'transition-[background-color,border-color,opacity,box-shadow]',
        orientation === 'vertical'
          ? 'h-24 w-8 flex-col gap-1 rounded-md px-1 py-2'
          : 'h-9 w-28 min-w-20 max-w-44 gap-1.5 rounded-t-md px-2',
        active
          ? 'bg-background text-foreground border-border'
          : 'bg-muted/60 text-muted-foreground border-transparent hover:bg-muted',
        previewAdded && 'border-info bg-info/10 text-info ring-1 ring-info/30',
        isDragging && 'opacity-45',
        isDragSource && 'ring-2 ring-info',
        dropZonesVisible && isDropTarget && 'bg-info/10',
      )}
      data-proof-tab-id={surface.id}
      data-proof-tab-preview-added={previewAdded ? 'true' : undefined}
      {...tilingTabAttributes(surface.id)}
      ref={(element) => {
        ref(element)
        handleRef(element)
        sourceRef(element)
      }}
      role='tab'
      tabIndex={0}
      onClick={selectSurface}
    >
      <span className={cn('size-2 rounded-full', previewAdded ? 'bg-info' : 'bg-primary')} />
      <span
        className={cn(
          'min-w-0 flex-1 truncate',
          orientation === 'vertical' && 'min-h-0 [writing-mode:vertical-rl]',
        )}
      >
        {surface.title}
      </span>
      {actionsVisible ? (
        <Button
          aria-label={`Close ${surface.title}`}
          className={cn(
            'size-5 opacity-0 group-focus-within/proof-tab:opacity-100 group-hover/proof-tab:opacity-100',
            orientation === 'vertical' && 'mt-1',
          )}
          disabled={!surface.capabilities.canClose}
          draggable={false}
          size='icon-xs'
          type='button'
          variant='ghost'
          onClick={(event) => {
            event.stopPropagation()
            onClose(surface.id)
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <XIcon className='size-3' />
        </Button>
      ) : null}
    </div>
  )
}
