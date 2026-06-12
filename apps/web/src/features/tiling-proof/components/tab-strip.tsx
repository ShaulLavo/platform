import { useDroppable } from '@dnd-kit/react'

import { ProofTab } from '@/features/tiling-proof/components/tab'
import { ProofTabPreview } from '@/features/tiling-proof/components/tab-preview'
import {
  TILING_TAB_TYPE,
  TILING_WINDOW_TYPE,
  tabStripDropId,
  type TilingDragData,
  type TilingDropData,
} from '@workspace/tiling/utils/drag-data'
import {
  tilingTabStripPreviewItems,
  type TilingInsertionPreview,
} from '@workspace/tiling/utils/tab-preview'
import type {
  Surface,
  SurfaceId,
  WorkbenchWindow,
  WorkspaceLayout,
} from '@workspace/tiling/utils/layout-types'
import { tilingTabStripAttributes } from '@workspace/tiling/utils/dom-attributes'
import { cn } from '@workspace/ui/lib/utils'

export function ProofTabStrip({
  activeDrag,
  actionsVisible = true,
  insertionPreview,
  insertionPreviewLayout,
  dropZonesVisible,
  optimisticSorting,
  orientation,
  surfaces,
  window,
  onCloseSurface,
  onSelectSurface,
}: {
  readonly activeDrag: TilingDragData | null
  readonly actionsVisible?: boolean
  readonly dropZonesVisible: boolean
  readonly insertionPreview: TilingInsertionPreview | null
  readonly insertionPreviewLayout: WorkspaceLayout
  readonly optimisticSorting: boolean
  readonly orientation: 'horizontal' | 'vertical'
  readonly surfaces: readonly Surface[]
  readonly window: WorkbenchWindow
  readonly onCloseSurface: (surfaceId: SurfaceId) => void
  readonly onSelectSurface: (surfaceId: SurfaceId) => void
}) {
  const data: TilingDropData = {
    index: surfaces.length,
    kind: 'tab-strip',
    windowId: window.id,
  }
  const { isDropTarget, ref } = useDroppable<TilingDropData>({
    accept: tabStripAcceptedTypes(activeDrag),
    data,
    disabled: activeDrag?.kind === 'window' && activeDrag.windowId === window.id,
    id: tabStripDropId(window.id),
  })
  const previewActive = insertionPreview?.targetWindowId === window.id
  const items = tilingTabStripPreviewItems({
    insertionPreview,
    layout: insertionPreviewLayout,
    surfaces,
    windowId: window.id,
  })
  const tabDropsAccepted = activeTabCanSortInStrip(activeDrag, surfaces)
  const tabSortingEnabled =
    optimisticSorting && orientation === 'horizontal' && !insertionPreview && tabDropsAccepted

  return (
    <div
      aria-label='Window tabs'
      aria-orientation={orientation}
      className={cn(
        'flex min-h-0 min-w-0 flex-1 gap-1 border-border',
        orientation === 'vertical'
          ? 'w-full flex-col items-center overflow-x-hidden overflow-y-auto py-1'
          : 'min-h-10 items-end overflow-x-auto border-b px-2 pt-2',
        dropZonesVisible && isDropTarget && 'bg-info/10',
      )}
      data-proof-tab-strip-orientation={orientation}
      data-proof-tab-strip-id={window.id}
      data-proof-tab-strip-preview={previewActive ? insertionPreview.kind : undefined}
      {...tilingTabStripAttributes({ orientation, windowId: window.id })}
      ref={ref}
      role='tablist'
    >
      {items.map((item) => {
        if (item.kind === 'ghost') {
          return <ProofTabPreview key={item.key} orientation={orientation} surface={item.surface} />
        }

        return (
          <ProofTab
            acceptsTabDrops={tabDropsAccepted}
            actionsVisible={actionsVisible}
            active={item.surface.id === window.activeSurfaceId}
            dropZonesVisible={dropZonesVisible}
            index={item.index}
            key={item.key}
            optimisticSorting={tabSortingEnabled}
            orientation={orientation}
            previewAdded={surfaceIsPreviewAdded(insertionPreview, window.id, item.surface.id)}
            surface={item.surface}
            windowId={window.id}
            onClose={onCloseSurface}
            onSelect={onSelectSurface}
          />
        )
      })}
      {items.length === 0 ? (
        <div
          className={cn(
            'text-muted-foreground flex items-center justify-center text-xs',
            orientation === 'vertical' ? 'h-16 w-full [writing-mode:vertical-rl]' : 'h-9 px-3',
          )}
        >
          Drop tab here
        </div>
      ) : null}
    </div>
  )
}

function activeTabCanSortInStrip(activeDrag: TilingDragData | null, surfaces: readonly Surface[]) {
  if (activeDrag?.kind !== 'tab') return true

  return surfaces.some((surface) => surface.id === activeDrag.surfaceId)
}

function tabStripAcceptedTypes(activeDrag: TilingDragData | null) {
  if (activeDrag?.kind === 'tab') return [TILING_WINDOW_TYPE]

  return [TILING_TAB_TYPE, TILING_WINDOW_TYPE]
}

function surfaceIsPreviewAdded(
  insertionPreview: TilingInsertionPreview | null,
  windowId: WorkbenchWindow['id'],
  surfaceId: SurfaceId,
) {
  if (insertionPreview?.kind !== 'window-merge') return false
  if (insertionPreview.targetWindowId !== windowId) return false

  return insertionPreview.sourceSurfaceIds.includes(surfaceId)
}
