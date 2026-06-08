import { useSortable } from '@dnd-kit/react/sortable'
import { XIcon } from '@phosphor-icons/react'

import {
  DND_PROOF_TAB_TYPE,
  tabDragId,
  type DndProofDragData,
  type DndProofDropData,
} from '@/features/dnd-proof/utils/drag-data'
import type {
  Surface,
  SurfaceId,
  WindowId,
} from '@/features/tiling-surface-manager/engine/layout-types'
import { Button } from '@workspace/ui/components/button'
import { cn } from '@workspace/ui/lib/utils'

export function ProofTab({
  active,
  index,
  surface,
  windowId,
  onClose,
  onSelect,
}: {
  readonly active: boolean
  readonly index: number
  readonly surface: Surface
  readonly windowId: WindowId
  readonly onClose: (surfaceId: SurfaceId) => void
  readonly onSelect: (surfaceId: SurfaceId) => void
}) {
  const data: DndProofDragData & DndProofDropData = {
    index,
    kind: 'tab',
    surfaceId: surface.id,
    windowId,
  }
  const { handleRef, isDragSource, isDragging, isDropTarget, ref } = useSortable<
    DndProofDragData & DndProofDropData
  >({
    accept: DND_PROOF_TAB_TYPE,
    data,
    group: windowId,
    id: tabDragId(surface.id),
    index,
    type: DND_PROOF_TAB_TYPE,
  })

  function selectSurface() {
    if (isDragging) return

    onSelect(surface.id)
  }

  return (
    <div
      aria-selected={active}
      className={cn(
        'group/proof-tab flex h-9 min-w-28 max-w-44 cursor-grab items-center gap-1.5 rounded-t-md border px-2 text-xs shadow-sm active:cursor-grabbing',
        'transition-[background-color,border-color,opacity,box-shadow]',
        active
          ? 'bg-background text-foreground border-border'
          : 'bg-muted/60 text-muted-foreground border-transparent hover:bg-muted',
        isDragging && 'opacity-45',
        isDragSource && 'ring-2 ring-info',
        isDropTarget && 'bg-info/10',
      )}
      data-proof-tab-id={surface.id}
      ref={(element) => {
        ref(element)
        handleRef(element)
      }}
      role='tab'
      tabIndex={0}
      onClick={selectSurface}
    >
      <span className='bg-primary size-2 rounded-full' />
      <span className='min-w-0 flex-1 truncate'>{surface.title}</span>
      <Button
        aria-label={`Close ${surface.title}`}
        className='size-5 opacity-0 group-focus-within/proof-tab:opacity-100 group-hover/proof-tab:opacity-100'
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
    </div>
  )
}
