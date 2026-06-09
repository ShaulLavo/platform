import { DragOverlay } from '@dnd-kit/react'
import { cn } from '@workspace/ui/lib/utils'

import type { DndProofDragData } from '@/features/dnd-proof/utils/drag-data'
import { proofWindowTitle } from '@/features/dnd-proof/utils/model'
import type {
  SurfaceId,
  WindowId,
  WorkspaceLayout,
} from '@/features/tiling-surface-manager/engine/layout-types'

export function ProofDragOverlay({
  activeDrag,
  layout,
}: {
  readonly activeDrag: DndProofDragData | null
  readonly layout: WorkspaceLayout
}) {
  return (
    <DragOverlay className='pointer-events-none fixed z-50' dropAnimation={null}>
      {overlayContent(activeDrag, layout)}
    </DragOverlay>
  )
}

function overlayContent(activeDrag: DndProofDragData | null, layout: WorkspaceLayout) {
  if (!activeDrag) return null
  if (activeDrag.kind === 'window') return windowOverlay(activeDrag.windowId, layout)

  return tabOverlay(activeDrag.surfaceId, layout)
}

function tabOverlay(surfaceId: SurfaceId, layout: WorkspaceLayout) {
  const surface = layout.surfacesById[surfaceId]
  if (!surface) return null

  return (
    <div className='bg-background text-foreground border-border flex h-9 max-w-48 min-w-32 items-center gap-1.5 rounded-t-md border px-2 text-xs shadow-lg'>
      <span className='bg-primary size-2 rounded-full' />
      <span className='min-w-0 flex-1 truncate'>{surface.title}</span>
    </div>
  )
}

function windowOverlay(windowId: WindowId, layout: WorkspaceLayout) {
  const window = layout.windowsById[windowId]
  if (!window) return null

  const surfaces = window.surfaceIds.flatMap((surfaceId) => {
    const surface = layout.surfacesById[surfaceId]
    if (!surface) return []

    return [surface]
  })
  const activeSurface = surfaces.find((surface) => surface.id === window.activeSurfaceId)
  const displaySurface = activeSurface ?? surfaces[0] ?? null
  const title = proofWindowTitle(layout, windowId)
  const collapsed = window.mode === 'collapsed'

  return (
    <div
      className={cn(
        'bg-card text-card-foreground border-border flex min-w-44 flex-col overflow-hidden rounded-md border shadow-lg',
        collapsed ? 'h-10' : 'h-full w-full',
      )}
      data-proof-drag-overlay-window-mode={window.mode}
    >
      <div className='border-border flex h-10 shrink-0 items-end gap-2 border-b pt-1'>
        <div className='mb-1 ml-1 grid h-8 w-5 shrink-0 place-items-center'>
          <span className='bg-muted-foreground/40 h-4 w-1 rounded-sm' />
        </div>
        <div className='flex min-h-10 min-w-0 flex-1 items-end gap-1 overflow-hidden px-2 pt-2'>
          {surfaces.map((surface) => (
            <div
              className='bg-muted/60 text-muted-foreground aria-selected:bg-background aria-selected:text-foreground aria-selected:border-border flex h-9 w-28 min-w-0 shrink-0 items-center gap-1.5 rounded-t-md border border-transparent px-2 text-xs shadow-sm'
              key={surface.id}
              aria-selected={surface.id === window.activeSurfaceId}
            >
              <span className='bg-primary size-2 rounded-full' />
              <span className='min-w-0 flex-1 truncate'>{surface.title}</span>
            </div>
          ))}
        </div>
      </div>
      {collapsed ? null : (
        <div className='relative min-h-0 flex-1 overflow-hidden p-3'>
          <div className='bg-background/70 border-border flex h-full min-h-0 flex-col rounded-sm border p-4'>
            <div className='min-w-0 text-sm font-medium'>{displaySurface?.title ?? title}</div>
            <div className='text-muted-foreground mt-1 text-xs'>
              {displaySurface?.type ?? 'empty'}
            </div>
            <div className='bg-muted/50 border-border text-muted-foreground mt-4 min-h-0 flex-1 rounded-sm border p-3 text-xs'>
              {displaySurface?.stateKey ?? displaySurface?.id ?? window.id}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
