import { useDroppable } from '@dnd-kit/react'

import { ProofTab } from '@/features/dnd-proof/components/proof-tab'
import {
  DND_PROOF_TAB_TYPE,
  DND_PROOF_WINDOW_TYPE,
  tabStripDropId,
  type DndProofDragData,
  type DndProofDropData,
} from '@/features/dnd-proof/utils/drag-data'
import type {
  Surface,
  SurfaceId,
  WorkbenchWindow,
} from '@/features/tiling-surface-manager/engine/layout-types'
import { cn } from '@workspace/ui/lib/utils'

export function ProofTabStrip({
  activeDrag,
  dropZonesVisible,
  optimisticSorting,
  orientation,
  surfaces,
  window,
  onCloseSurface,
  onSelectSurface,
}: {
  readonly activeDrag: DndProofDragData | null
  readonly dropZonesVisible: boolean
  readonly optimisticSorting: boolean
  readonly orientation: 'horizontal' | 'vertical'
  readonly surfaces: readonly Surface[]
  readonly window: WorkbenchWindow
  readonly onCloseSurface: (surfaceId: SurfaceId) => void
  readonly onSelectSurface: (surfaceId: SurfaceId) => void
}) {
  const data: DndProofDropData = {
    index: surfaces.length,
    kind: 'tab-strip',
    windowId: window.id,
  }
  const { isDropTarget, ref } = useDroppable<DndProofDropData>({
    accept: [DND_PROOF_TAB_TYPE, DND_PROOF_WINDOW_TYPE],
    data,
    disabled: activeDrag?.kind === 'window' && activeDrag.windowId === window.id,
    id: tabStripDropId(window.id),
  })

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
      ref={ref}
      role='tablist'
    >
      {surfaces.map((surface, index) => (
        <ProofTab
          active={surface.id === window.activeSurfaceId}
          dropZonesVisible={dropZonesVisible}
          index={index}
          key={surface.id}
          optimisticSorting={optimisticSorting && orientation === 'horizontal'}
          orientation={orientation}
          surface={surface}
          windowId={window.id}
          onClose={onCloseSurface}
          onSelect={onSelectSurface}
        />
      ))}
      {surfaces.length === 0 ? (
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
