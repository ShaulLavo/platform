import { useDraggable, useDroppable } from '@dnd-kit/react'
import { DotsSixVerticalIcon, MinusIcon, PlusIcon, XIcon } from '@phosphor-icons/react'

import { ProofTabStrip } from '@/features/dnd-proof/components/proof-tab-strip'
import {
  DND_PROOF_TAB_TYPE,
  DND_PROOF_WINDOW_TYPE,
  windowDragId,
  type DndProofDragData,
  type DndProofDropData,
} from '@/features/dnd-proof/utils/drag-data'
import type { ResolvedDndProofTarget } from '@/features/dnd-proof/utils/drop-target-resolver'
import { proofWindowTitle } from '@/features/dnd-proof/utils/model'
import { tabPreviewSurfacesForWindow } from '@/features/dnd-proof/utils/tab-preview'
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
  activeResolvedTarget,
  dropZonesVisible,
  layout,
  optimisticTabSorting,
  rect,
  tabStripRenderEpoch,
  window,
  onAddTab,
  onCloseSurface,
  onCloseWindow,
  onSelectSurface,
  onToggleWindowCollapse,
}: {
  readonly activeDrag: DndProofDragData | null
  readonly activeResolvedTarget: ResolvedDndProofTarget | null
  readonly dropZonesVisible: boolean
  readonly layout: WorkspaceLayout
  readonly optimisticTabSorting: boolean
  readonly rect: LayoutRect
  readonly tabStripRenderEpoch: number
  readonly window: WorkbenchWindow
  readonly onAddTab: (windowId: WorkbenchWindow['id']) => void
  readonly onCloseSurface: (surfaceId: SurfaceId) => void
  readonly onCloseWindow: (windowId: WorkbenchWindow['id']) => void
  readonly onSelectSurface: (surfaceId: SurfaceId) => void
  readonly onToggleWindowCollapse: (windowId: WorkbenchWindow['id']) => void
}) {
  const data: DndProofDragData & DndProofDropData = {
    kind: 'window',
    windowId: window.id,
  }
  const {
    handleRef,
    isDragSource,
    isDragging,
    ref: draggableRef,
  } = useDraggable<DndProofDragData & DndProofDropData>({
    data,
    id: windowDragId(window.id),
    type: DND_PROOF_WINDOW_TYPE,
  })
  const { isDropTarget, ref: droppableRef } = useDroppable<DndProofDropData>({
    accept: [DND_PROOF_TAB_TYPE, DND_PROOF_WINDOW_TYPE],
    data,
    disabled: activeDrag?.kind === 'window' && activeDrag.windowId === window.id,
    id: windowDragId(window.id),
  })
  const baseSurfaces = window.surfaceIds.flatMap((surfaceId) => {
    const surface = layout.surfacesById[surfaceId]
    if (!surface) return []

    return [surface]
  })
  const surfaces = tabPreviewSurfacesForWindow({
    activeDrag,
    layout,
    resolvedTarget: activeResolvedTarget,
    surfaces: baseSurfaces,
    windowId: window.id,
  })
  const activeSurface = activeSurfaceForWindow(surfaces, window)
  const collapsed = window.mode === 'collapsed'
  const windowCanCollapse = surfaces.every((surface) => surface.capabilities.canCollapse)
  const title = proofWindowTitle(layout, window.id)
  const collapseLabel = collapsed
    ? `Expand ${activeSurface?.title ?? title}`
    : `Collapse ${activeSurface?.title ?? title}`
  const chromeOrientation = collapsedChromeOrientation(collapsed, rect)

  return (
    <section
      aria-label={title}
      className={cn(
        'bg-card absolute isolate flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-border shadow-sm',
        'transition-[left,top,width,height,background-color,border-color,opacity,box-shadow] duration-150 ease-out',
        isDragging && 'opacity-55',
        isDragSource && 'ring-2 ring-info',
        dropZonesVisible && isDropTarget && 'bg-info/10',
      )}
      data-proof-window-collapsed={collapsed ? 'true' : 'false'}
      data-proof-window-chrome-orientation={chromeOrientation}
      data-proof-window-id={window.id}
      data-proof-window-mode={window.mode}
      ref={(element) => {
        draggableRef(element)
        droppableRef(element)
      }}
      role='region'
      style={layoutRectStyle(rect)}
    >
      <header
        className={cn(
          'border-border flex shrink-0 cursor-grab active:cursor-grabbing',
          chromeOrientation === 'vertical'
            ? 'h-full w-full flex-col items-center gap-1 border-r px-1 py-1'
            : 'h-10 items-end gap-2 border-b pt-1',
        )}
        ref={handleRef}
      >
        <div
          aria-label={`Drag ${title}`}
          className={cn(
            'text-muted-foreground grid shrink-0 place-items-center text-sm',
            chromeOrientation === 'vertical' ? 'h-7 w-8' : 'mb-1 ml-1 h-8 w-5',
          )}
          data-proof-window-drag-handle=''
          role='button'
          tabIndex={0}
        >
          <DotsSixVerticalIcon className='size-3.5' />
        </div>
        <ProofTabStrip
          activeDrag={activeDrag}
          dropZonesVisible={dropZonesVisible}
          key={`${window.id}:${tabStripRenderEpoch}`}
          optimisticSorting={optimisticTabSorting}
          orientation={chromeOrientation}
          surfaces={surfaces}
          window={window}
          onCloseSurface={onCloseSurface}
          onSelectSurface={onSelectSurface}
        />
        <div
          className={cn(
            'flex shrink-0 items-center gap-0.5',
            chromeOrientation === 'vertical' ? 'w-full flex-col px-0 pb-1' : 'h-8 pr-1 pb-1',
          )}
        >
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
            aria-label={collapseLabel}
            className='text-muted-foreground hover:text-foreground size-7 rounded-md'
            disabled={!windowCanCollapse}
            size='icon-sm'
            title={collapseLabel}
            type='button'
            variant='ghost'
            onClick={() => onToggleWindowCollapse(window.id)}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <MinusIcon className='size-3.5' />
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
      <div
        className={cn('relative min-h-0 flex-1 overflow-hidden p-3', collapsed && 'hidden')}
        data-proof-window-body=''
      >
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

function collapsedChromeOrientation(collapsed: boolean, rect: LayoutRect) {
  if (!collapsed) return 'horizontal'
  if (rect.width >= rect.height) return 'horizontal'

  return 'vertical'
}

function activeSurfaceForWindow(
  surfaces: readonly Surface[],
  window: WorkbenchWindow,
): Surface | null {
  const activeSurface = surfaces.find((surface) => surface.id === window.activeSurfaceId)
  if (activeSurface) return activeSurface

  return surfaces[0] ?? null
}
