import {
  dropRegionFocus,
  regionCenterRect,
  rootEdgeRibbonRect,
  wedgeTrianglePoints,
} from '@/features/tiling-proof/utils/drop-region'
import type { TilingDragData } from '@workspace/tiling/utils/drag-data'
import type { ResolvedTilingTarget } from '@workspace/tiling/utils/drop-target-resolver'
import type { LayoutGeometry, LayoutRect } from '@workspace/tiling/utils/layout-geometry'
import type { LayoutEdge } from '@workspace/tiling/utils/layout-types'

const LAYOUT_EDGES: readonly LayoutEdge[] = ['left', 'right', 'top', 'bottom']

// The partition made visible: the window under the pointer is sliced into four
// split wedges plus a center merge zone, and the four root-dock margins ride the
// viewport edges. The active region (from the resolved target) reads strongest.
export function DropRegionOverlay({
  activeDrag,
  activeResolvedTarget,
  rootRect,
  visible,
  windowRectsById,
}: {
  readonly activeDrag: TilingDragData | null
  readonly activeResolvedTarget: ResolvedTilingTarget | null
  readonly rootRect: LayoutRect
  readonly visible: boolean
  readonly windowRectsById: LayoutGeometry['windowRectsById']
}) {
  if (!activeDrag) return null
  if (!visible) return null

  const focus = dropRegionFocus(activeResolvedTarget)
  const focusRect = focus.windowId ? (windowRectsById[focus.windowId]?.rect ?? null) : null
  const centerRect = focusRect ? regionCenterRect(focusRect) : null

  return (
    <svg aria-hidden className='pointer-events-none absolute inset-0 z-40 h-full w-full'>
      {/* Only whole-window drags wedge-split; a tab shows just the merge chip +
          the root-dock ribbons, matching what the resolver will actually do. */}
      {focusRect && activeDrag.kind === 'window'
        ? LAYOUT_EDGES.map((edge) => (
            <polygon
              fill='var(--color-info)'
              fillOpacity={focus.wedge === edge ? 0.28 : 0.06}
              key={`wedge-${edge}`}
              points={wedgeTrianglePoints(focusRect, edge)}
              stroke={focus.wedge === edge ? 'var(--color-info)' : 'var(--color-border)'}
              strokeDasharray='4 3'
              strokeOpacity={focus.wedge === edge ? 0.9 : 0.5}
            />
          ))
        : null}
      {centerRect ? (
        <rect
          fill={focus.wedge === 'center' ? 'var(--color-info)' : 'var(--color-card)'}
          fillOpacity={focus.wedge === 'center' ? 0.3 : 0.85}
          height={centerRect.height}
          rx={6}
          stroke={focus.wedge === 'center' ? 'var(--color-info)' : 'var(--color-border)'}
          width={centerRect.width}
          x={centerRect.x}
          y={centerRect.y}
        />
      ) : null}
      {LAYOUT_EDGES.map((edge) => {
        const ribbon = rootEdgeRibbonRect(rootRect, edge)

        return (
          <rect
            fill='var(--color-info)'
            fillOpacity={focus.rootEdge === edge ? 0.25 : 0.05}
            height={ribbon.height}
            key={`root-${edge}`}
            width={ribbon.width}
            x={ribbon.x}
            y={ribbon.y}
          />
        )
      })}
    </svg>
  )
}
