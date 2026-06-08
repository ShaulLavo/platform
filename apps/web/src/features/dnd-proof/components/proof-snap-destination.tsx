import { useDroppable } from '@dnd-kit/react'

import {
  DND_PROOF_TAB_TYPE,
  DND_PROOF_WINDOW_TYPE,
  snapDestinationDropId,
  type DndProofDropData,
} from '@/features/dnd-proof/utils/drag-data'
import type { ProofSnapDestinationRect } from '@/features/dnd-proof/utils/snap-destinations'
import { layoutRectStyle } from '@/features/workbench/utils/layout-style'
import { cn } from '@workspace/ui/lib/utils'

export function ProofSnapDestination({
  snapDestination,
}: {
  readonly snapDestination: ProofSnapDestinationRect
}) {
  const data: DndProofDropData = {
    destination: snapDestination.destination,
    kind: 'snap-destination',
  }
  const { isDropTarget, ref } = useDroppable<DndProofDropData>({
    accept: [DND_PROOF_TAB_TYPE, DND_PROOF_WINDOW_TYPE],
    data,
    id: snapDestinationDropId(snapDestination.id),
  })

  return (
    <div
      className={cn(
        'pointer-events-none absolute z-30 grid place-items-center rounded-md border border-dashed border-info/30 bg-info/5 text-[0.65rem] font-medium text-info opacity-65 transition-[opacity,background-color,border-color]',
        isDropTarget && 'border-info bg-info/20 opacity-100 ring-2 ring-info',
      )}
      data-proof-snap-destination={snapDestination.id}
      data-proof-snap-drop-data={JSON.stringify(data)}
      data-proof-snap-kind={snapDestination.kind}
      ref={ref}
      style={layoutRectStyle(snapDestination.rect)}
    >
      {snapDestinationLabel(snapDestination)}
    </div>
  )
}

function snapDestinationLabel(snapDestination: ProofSnapDestinationRect) {
  if (snapDestination.kind === 'root-edge') return `root ${snapDestination.edge}`
  if (snapDestination.kind === 'window-edge') return `window ${snapDestination.edge}`
  if (snapDestination.kind === 'window-center') return 'merge tabs'
  if (snapDestination.kind === 'parent-edge') return `parent ${snapDestination.edge}`
  if (snapDestination.kind === 'recipe-slot') return snapDestination.destination.kind

  return snapDestination.kind
}
