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
  surfaces,
  window,
  onCloseSurface,
  onSelectSurface,
}: {
  readonly activeDrag: DndProofDragData | null
  readonly dropZonesVisible: boolean
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
      className={cn(
        'flex min-h-10 min-w-0 flex-1 items-end gap-1 overflow-x-auto border-b border-border px-2 pt-2',
        dropZonesVisible && isDropTarget && 'bg-info/10',
      )}
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
          surface={surface}
          windowId={window.id}
          onClose={onCloseSurface}
          onSelect={onSelectSurface}
        />
      ))}
      {surfaces.length === 0 ? (
        <div className='text-muted-foreground flex h-9 items-center px-3 text-xs'>
          Drop tab here
        </div>
      ) : null}
    </div>
  )
}
