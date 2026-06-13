import { useDraggable, useDroppable } from '@dnd-kit/react'
import {
  ArrowsOutSimpleIcon,
  DotsSixVerticalIcon,
  MinusIcon,
  PlusIcon,
  XIcon,
} from '@phosphor-icons/react'
import type { ReactNode } from 'react'

import { ProofTabStrip } from '@/features/tiling-proof/components/tab-strip'
import {
  TILING_TAB_TYPE,
  TILING_WINDOW_TYPE,
  windowDragId,
  type TilingDragData,
  type TilingDropData,
} from '@workspace/tiling/utils/drag-data'
import { windowTitle } from '@workspace/tiling/utils/layout-queries'
import type { TilingInsertionPreview } from '@workspace/tiling/utils/tab-preview'
import type { LayoutRect } from '@workspace/tiling/utils/layout-geometry'
import type {
  Surface,
  SurfaceId,
  WorkbenchWindow,
  WorkspaceLayout,
} from '@workspace/tiling/utils/layout-types'
import { tilingWindowAttributes } from '@workspace/tiling/utils/dom-attributes'
import { layoutRectStyle } from '@/features/workbench/utils/layout-style'
import { Button } from '@workspace/ui/components/button'
import { cn } from '@workspace/ui/lib/utils'

export function ProofWindow({
  activeDrag,
  addTabVisible = true,
  dropZonesVisible,
  insertionPreview,
  insertionPreviewLayout,
  layout,
  optimisticTabSorting,
  preview = false,
  rect,
  resizingWindows,
  renderSurfaceBody,
  tabActionsVisible = true,
  tabStripRenderEpoch,
  window,
  windowActionsVisible = true,
  onAddTab,
  onCollapseWindowToRail,
  onCollapseWindowToRow,
  onCloseSurface,
  onCloseWindow,
  onExpandWindow,
  onSelectSurface,
}: {
  readonly activeDrag: TilingDragData | null
  readonly addTabVisible?: boolean
  readonly dropZonesVisible: boolean
  readonly insertionPreview: TilingInsertionPreview | null
  readonly insertionPreviewLayout: WorkspaceLayout
  readonly layout: WorkspaceLayout
  readonly optimisticTabSorting: boolean
  // A preview-only window (a tab snapped out to its own window) renders as the
  // real window faded out at its destination, but inert: no drag/drop wiring,
  // so it never becomes a drop target or feeds back into the live drag.
  readonly preview?: boolean
  readonly rect: LayoutRect
  readonly resizingWindows: boolean
  readonly renderSurfaceBody?: (surface: Surface | null, window: WorkbenchWindow) => ReactNode
  readonly tabActionsVisible?: boolean
  readonly tabStripRenderEpoch: number
  readonly window: WorkbenchWindow
  readonly windowActionsVisible?: boolean
  readonly onAddTab: (windowId: WorkbenchWindow['id']) => void
  readonly onCollapseWindowToRail: (windowId: WorkbenchWindow['id']) => void
  readonly onCollapseWindowToRow: (windowId: WorkbenchWindow['id']) => void
  readonly onCloseSurface: (surfaceId: SurfaceId) => void
  readonly onCloseWindow: (windowId: WorkbenchWindow['id']) => void
  readonly onExpandWindow: (windowId: WorkbenchWindow['id']) => void
  readonly onSelectSurface: (surfaceId: SurfaceId) => void
}) {
  const data: TilingDragData & TilingDropData = {
    kind: 'window',
    windowId: window.id,
  }
  const {
    handleRef,
    isDragSource,
    isDragging,
    ref: draggableRef,
  } = useDraggable<TilingDragData & TilingDropData>({
    data,
    disabled: preview,
    id: windowDragId(window.id),
    type: TILING_WINDOW_TYPE,
  })
  const { isDropTarget, ref: droppableRef } = useDroppable<TilingDropData>({
    accept: [TILING_TAB_TYPE, TILING_WINDOW_TYPE],
    data,
    disabled: preview || (activeDrag?.kind === 'window' && activeDrag.windowId === window.id),
    id: windowDragId(window.id),
  })
  const baseSurfaces = window.surfaceIds.flatMap((surfaceId) => {
    const surface = layout.surfacesById[surfaceId]
    if (!surface) return []

    return [surface]
  })
  const surfaces = baseSurfaces
  const activeSurface = activeSurfaceForWindow(surfaces, window)
  const collapsed = window.mode === 'collapsed'
  const windowCanCollapse = surfaces.every((surface) => surface.capabilities.canCollapse)
  const insertionPreviewActive = insertionPreview?.targetWindowId === window.id
  const title = windowTitle(layout, window.id)
  const activeTitle = activeSurface?.title ?? title
  const collapseToRailLabel = `Collapse ${activeTitle} to rail`
  const collapseToRowLabel = `Collapse ${activeTitle} to row`
  const expandLabel = `Expand ${activeTitle}`
  const chromeOrientation = collapsedChromeOrientation(collapsed, rect)
  const rowButtonActive = collapsed && collapsedWindowLooksLikeRow(window, chromeOrientation)
  const railButtonActive = collapsed && collapsedWindowLooksLikeRail(window, chromeOrientation)
  const rowButtonLabel = rowButtonActive ? expandLabel : collapseToRowLabel
  const railButtonLabel = railButtonActive ? expandLabel : collapseToRailLabel
  const headerActionsVisible = addTabVisible || windowActionsVisible

  function handleRowButtonClick() {
    if (rowButtonActive) {
      onExpandWindow(window.id)
      return
    }

    onCollapseWindowToRow(window.id)
  }

  function handleRailButtonClick() {
    if (railButtonActive) {
      onExpandWindow(window.id)
      return
    }

    onCollapseWindowToRail(window.id)
  }

  return (
    <section
      aria-label={title}
      className={cn(
        'bg-card absolute isolate flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-border shadow-sm',
        resizingWindows
          ? 'transition-[background-color,border-color,opacity,box-shadow] duration-150 ease-out'
          : 'transition-[left,top,width,height,background-color,border-color,opacity,box-shadow] duration-150 ease-out',
        (isDragging || preview) && 'opacity-55',
        (isDragSource || preview) && 'ring-2 ring-info',
        preview && 'pointer-events-none',
        insertionPreviewActive && 'ring-2 ring-info/70 shadow-md',
        dropZonesVisible && isDropTarget && 'bg-info/10',
      )}
      data-proof-window-collapsed={collapsed ? 'true' : 'false'}
      data-proof-window-collapsed-edge={window.collapsedEdge}
      data-proof-window-chrome-orientation={chromeOrientation}
      data-proof-window-id={window.id}
      data-proof-window-insertion-preview={
        insertionPreviewActive ? insertionPreview.kind : undefined
      }
      data-proof-window-mode={window.mode}
      {...tilingWindowAttributes(window.id)}
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
          actionsVisible={tabActionsVisible}
          dropZonesVisible={dropZonesVisible}
          insertionPreview={insertionPreview}
          insertionPreviewLayout={insertionPreviewLayout}
          interactive={!preview}
          key={`${window.id}:${tabStripRenderEpoch}`}
          optimisticSorting={optimisticTabSorting}
          orientation={chromeOrientation}
          surfaces={surfaces}
          window={window}
          onCloseSurface={onCloseSurface}
          onSelectSurface={onSelectSurface}
        />
        {headerActionsVisible ? (
          <div
            className={cn(
              'flex shrink-0 items-center gap-0.5',
              chromeOrientation === 'vertical' ? 'w-full flex-col px-0 pb-1' : 'h-8 pr-1 pb-1',
            )}
          >
            {addTabVisible ? (
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
            ) : null}
            {windowActionsVisible ? (
              <>
                <Button
                  aria-label={rowButtonLabel}
                  className='text-muted-foreground hover:text-foreground size-7 rounded-md'
                  disabled={!rowButtonActive && !windowCanCollapse}
                  size='icon-sm'
                  title={rowButtonLabel}
                  type='button'
                  variant='ghost'
                  onClick={handleRowButtonClick}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  {rowButtonActive ? (
                    <ArrowsOutSimpleIcon className='size-3.5' />
                  ) : (
                    <MinusIcon className='size-3.5' />
                  )}
                </Button>
                <Button
                  aria-label={railButtonLabel}
                  className='text-muted-foreground hover:text-foreground size-7 rounded-md'
                  disabled={!railButtonActive && !windowCanCollapse}
                  size='icon-sm'
                  title={railButtonLabel}
                  type='button'
                  variant='ghost'
                  onClick={handleRailButtonClick}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  {railButtonActive ? (
                    <ArrowsOutSimpleIcon className='size-3.5' />
                  ) : (
                    <MinusIcon className='size-3.5 rotate-90' />
                  )}
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
              </>
            ) : null}
          </div>
        ) : null}
      </header>
      <div
        className={cn('relative min-h-0 flex-1 overflow-hidden p-3', collapsed && 'hidden')}
        data-proof-window-body=''
      >
        {renderSurfaceBody
          ? renderSurfaceBody(activeSurface, window)
          : defaultSurfaceBody(activeSurface, title, window.id)}
      </div>
    </section>
  )
}

function defaultSurfaceBody(
  activeSurface: Surface | null,
  title: string,
  windowId: WorkbenchWindow['id'],
) {
  return (
    <div className='bg-background border-border flex h-full min-h-0 flex-col rounded-sm border p-4'>
      <div className='min-w-0 text-sm font-medium'>{activeSurface?.title ?? title}</div>
      <div className='text-muted-foreground mt-1 text-xs'>{activeSurface?.type ?? 'empty'}</div>
      <div className='bg-muted/50 border-border text-muted-foreground mt-4 min-h-0 flex-1 rounded-sm border p-3 text-xs'>
        {activeSurface?.stateKey ?? activeSurface?.id ?? windowId}
      </div>
    </div>
  )
}

function collapsedChromeOrientation(collapsed: boolean, rect: LayoutRect) {
  if (!collapsed) return 'horizontal'
  if (rect.width >= rect.height) return 'horizontal'

  return 'vertical'
}

function collapsedWindowLooksLikeRow(
  window: WorkbenchWindow,
  chromeOrientation: 'horizontal' | 'vertical',
) {
  if (window.collapsedEdge === 'top') return true
  if (window.collapsedEdge === 'bottom') return true
  if (window.collapsedEdge) return false

  return chromeOrientation === 'horizontal'
}

function collapsedWindowLooksLikeRail(
  window: WorkbenchWindow,
  chromeOrientation: 'horizontal' | 'vertical',
) {
  if (window.collapsedEdge === 'left') return true
  if (window.collapsedEdge === 'right') return true
  if (window.collapsedEdge) return false

  return chromeOrientation === 'vertical'
}

function activeSurfaceForWindow(
  surfaces: readonly Surface[],
  window: WorkbenchWindow,
): Surface | null {
  const activeSurface = surfaces.find((surface) => surface.id === window.activeSurfaceId)
  if (activeSurface) return activeSurface

  return surfaces[0] ?? null
}
