import { layoutRectStyle } from '@/features/workbench/utils/layout-style'
import type { TilingDropCandidate } from '@workspace/tiling/utils/snap-destinations'
import { cn } from '@workspace/ui/lib/utils'

export function ProofSnapDestination({
  active,
  candidate,
  visible,
}: {
  readonly active: boolean
  readonly candidate: TilingDropCandidate
  readonly visible: boolean
}) {
  return (
    <div
      className={cn(
        'pointer-events-none absolute z-30 grid place-items-center rounded-md border border-dashed text-[0.65rem] font-medium transition-[opacity,background-color,border-color,box-shadow]',
        visible && !active && 'border-info/20 bg-info/5 text-info/70 opacity-45',
        !visible && 'opacity-0',
        visible && active && 'border-info bg-info/20 text-info opacity-100 ring-2 ring-info',
      )}
      data-proof-snap-active={active ? 'true' : undefined}
      data-proof-snap-destination={candidate.id}
      data-proof-snap-kind={candidate.kind}
      style={layoutRectStyle(candidate.previewRect)}
    >
      {candidate.label}
    </div>
  )
}
