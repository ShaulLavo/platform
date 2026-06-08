import { useSortable } from '@dnd-kit/react/sortable'
import { DotsSixVerticalIcon, PlusIcon, XIcon } from '@phosphor-icons/react'

import { ProofTabStrip } from '@/features/dnd-proof/components/proof-tab-strip'
import {
  DND_PROOF_WINDOW_TYPE,
  windowDragId,
  type DndProofDragData,
  type DndProofDropData,
} from '@/features/dnd-proof/utils/drag-data'
import { proofWindowTitle } from '@/features/dnd-proof/utils/model'
import type { LayoutRect } from '@/features/tiling-surface-manager/engine/layout-geometry'
import type {
  Surface,
  SurfaceId,
  WorkbenchWindow,
  WorkspaceLayout,
} from '@/features/tiling-surface-manager/engine/layout-types'
import { layoutRectStyle } from '@/features/workbench/utils/layout-style'
import { Button } from '@workspace/ui/components/button'
import { cn } from '@workspace/ui/lib/utils'

export function ProofWindow({
  activeDrag,
  index,
  layout,
  rect,
  window,
  onAddTab,
  onCloseSurface,
  onCloseWindow,
  onSelectSurface,
}: {
  readonly activeDrag: DndProofDragData | null
  readonly index: number
  readonly layout: WorkspaceLayout
  readonly rect: LayoutRect
  readonly window: WorkbenchWindow
  readonly onAddTab: (windowId: WorkbenchWindow['id']) => void
  readonly onCloseSurface: (surfaceId: SurfaceId) => void
  readonly onCloseWindow: (windowId: WorkbenchWindow['id']) => void
  readonly onSelectSurface: (surfaceId: SurfaceId) => void
}) {
  const data: DndProofDragData & DndProofDropData = {
    kind: 'window',
    windowId: window.id,
  }
  const { handleRef, isDragSource, isDragging, isDropTarget, ref, sourceRef } = useSortable<
    DndProofDragData & DndProofDropData
  >({
    accept: DND_PROOF_WINDOW_TYPE,
    data,
    group: 'proof-windows',
    id: windowDragId(window.id),
    index,
    type: DND_PROOF_WINDOW_TYPE,
  })
  const surfaces = window.surfaceIds.flatMap((surfaceId) => {
    const surface = layout.surfacesById[surfaceId]
    if (!surface) return []

    return [surface]
  })
  const activeSurface = activeSurfaceForWindow(surfaces, window)
  const title = proofWindowTitle(layout, window.id)

  return (
    <section
      aria-label={title}
      className={cn(
        'bg-card absolute isolate flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-border shadow-sm',
        'transition-[left,top,width,height,background-color,border-color,opacity,box-shadow] duration-150 ease-out',
        isDragging && 'opacity-55',
        isDragSource && 'ring-2 ring-info',
        isDropTarget && 'bg-info/10',
      )}
      data-proof-window-id={window.id}
      ref={ref}
      role='region'
      style={layoutRectStyle(rect)}
    >
      <header className='border-border flex h-10 shrink-0 items-end gap-2 border-b pt-1'>
        <div
          aria-label={`Drag ${title}`}
          className='text-muted-foreground mb-1 ml-1 grid h-8 w-5 shrink-0 cursor-grab place-items-center text-sm active:cursor-grabbing'
          data-proof-window-drag-handle=''
          ref={(element) => {
            handleRef(element)
            sourceRef(element)
          }}
          role='button'
          tabIndex={0}
        >
          <DotsSixVerticalIcon className='size-3.5' />
        </div>
        <ProofTabStrip
          activeDrag={activeDrag}
          surfaces={surfaces}
          window={window}
          onCloseSurface={onCloseSurface}
          onSelectSurface={onSelectSurface}
        />
        <div className='flex h-8 shrink-0 items-center gap-0.5 pr-1 pb-1'>
          <Button
            aria-label={`Add tab to ${title}`}
            size='icon-xs'
            type='button'
            variant='ghost'
            onClick={() => onAddTab(window.id)}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <PlusIcon className='size-3' />
          </Button>
          <Button
            aria-label={`Close ${title}`}
            size='icon-xs'
            type='button'
            variant='ghost'
            onClick={() => onCloseWindow(window.id)}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <XIcon className='size-3' />
          </Button>
        </div>
      </header>
      <div className='relative min-h-0 flex-1 overflow-hidden p-3'>
        <div className='bg-background/70 border-border flex h-full min-h-0 flex-col rounded-sm border p-4'>
          <div className='min-w-0 text-sm font-medium'>{activeSurface?.title ?? title}</div>
          <div className='text-muted-foreground mt-1 text-xs'>{activeSurface?.type ?? 'empty'}</div>
          <div className='bg-muted/50 border-border text-muted-foreground mt-4 min-h-0 flex-1 rounded-sm border p-3 text-xs'>
            {activeSurface?.stateKey ?? activeSurface?.id ?? window.id}
          </div>
        </div>
      </div>
    </section>
  )
}

function activeSurfaceForWindow(
  surfaces: readonly Surface[],
  window: WorkbenchWindow,
): Surface | null {
  const activeSurface = surfaces.find((surface) => surface.id === window.activeSurfaceId)
  if (activeSurface) return activeSurface

  return surfaces[0] ?? null
}
