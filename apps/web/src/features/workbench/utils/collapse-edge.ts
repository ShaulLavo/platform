import type { LayoutGeometry, LayoutRect } from '@workspace/tiling/utils/layout-geometry'
import type { LayoutEdge, WindowId } from '@workspace/tiling/utils/layout-types'

export type CollapseTarget = 'rail' | 'row'

type CollapseEdgeInput = {
  readonly surfaceRect: LayoutRect
  readonly windowId: WindowId
  readonly windowRectsById: LayoutGeometry['windowRectsById']
}

export function collapseEdgeForTarget(
  target: CollapseTarget,
  input: CollapseEdgeInput,
): LayoutEdge {
  if (target === 'row') return rowCollapseEdge(input)

  return railCollapseEdge(input)
}

function rowCollapseEdge({
  surfaceRect,
  windowId,
  windowRectsById,
}: CollapseEdgeInput): LayoutEdge {
  const rect = windowRectsById[windowId]?.rect
  if (!rect) return 'bottom'

  const centerY = rect.y + rect.height / 2
  const midpointY = surfaceRect.y + surfaceRect.height / 2
  if (centerY < midpointY) return 'top'

  return 'bottom'
}

function railCollapseEdge({
  surfaceRect,
  windowId,
  windowRectsById,
}: CollapseEdgeInput): LayoutEdge {
  const rect = windowRectsById[windowId]?.rect
  if (!rect) return 'left'

  const centerX = rect.x + rect.width / 2
  const midpointX = surfaceRect.x + surfaceRect.width / 2
  if (centerX > midpointX) return 'right'

  return 'left'
}
