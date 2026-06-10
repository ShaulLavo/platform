import type { TilingDragData, TilingDropData } from '@workspace/tiling/utils/drag-data'
import type { LayoutRect, SnapDestinationLayoutRect } from '@workspace/tiling/utils/layout-geometry'
import type { LayoutEdge, WindowId } from '@workspace/tiling/utils/layout-types'

export type TilingDropCandidate = {
  readonly edge?: LayoutEdge
  readonly hitRect: LayoutRect
  readonly id: string
  readonly kind: SnapDestinationLayoutRect['kind'] | 'source-return'
  readonly label: string
  readonly previewRect: LayoutRect
  readonly priority: number
  readonly target: TilingDropData
  readonly windowId?: WindowId
}

const OUTER_EDGE_EPSILON_PX = 2
const ROOT_EDGE_PRIORITY = 95
const SOURCE_RETURN_PRIORITY = 120
const INTERNAL_WINDOW_EDGE_PRIORITY = 105
const SOURCE_VACANCY_ROOT_PRIORITY = 89
const OUTER_WINDOW_EDGE_PRIORITY = 88
const WINDOW_CENTER_PRIORITY = 100
const ROOT_EDGE_HIT_INSIDE_PX = 10
const ROOT_EDGE_HIT_OUTSIDE_PX = 28
const WINDOW_EDGE_HIT_PX = 48
const SOURCE_VACANCY_EDGE_RATIO = 0.32
const SOURCE_VACANCY_EDGE_SOURCE_MAX_RATIO = 0.48
const SOURCE_VACANCY_EDGE_MIN_PX = 56
const SOURCE_VACANCY_EDGE_MAX_PX = 180

export function tilingSnapDestinations({
  activeDrag,
  rootRect,
  snapDestinationRects,
  sourceWindowRect,
  sourceWindowId,
}: {
  readonly activeDrag: TilingDragData | null
  readonly rootRect: LayoutRect
  readonly snapDestinationRects: readonly SnapDestinationLayoutRect[]
  readonly sourceWindowRect?: LayoutRect | null
  readonly sourceWindowId: WindowId | null
}): readonly TilingDropCandidate[] {
  return [
    ...snapDestinationRects.flatMap((snapDestination) =>
      tilingSnapCandidate({
        activeDrag,
        rootRect,
        snapDestination,
        sourceWindowId,
      }),
    ),
    ...sourceWindowCandidates({
      activeDrag,
      snapDestinationRects,
      sourceWindowId,
      sourceWindowRect,
    }),
  ]
}

function sourceWindowCandidates({
  activeDrag,
  snapDestinationRects,
  sourceWindowId,
  sourceWindowRect,
}: {
  readonly activeDrag: TilingDragData | null
  readonly snapDestinationRects: readonly SnapDestinationLayoutRect[]
  readonly sourceWindowId: WindowId | null
  readonly sourceWindowRect?: LayoutRect | null
}) {
  if (activeDrag?.kind !== 'window') return []
  if (!sourceWindowId) return []
  if (!sourceWindowRect) return []

  const rootEdges = sourceVacancyRootEdges(sourceWindowRect, snapDestinationRects)
  if (rootEdges.length === 0) return [sourceReturnCandidate(sourceWindowId, sourceWindowRect)]

  return [
    sourceReturnCandidate(sourceWindowId, sourceReturnHitRect(sourceWindowRect, rootEdges)),
    ...rootEdges.map((snapDestination) =>
      sourceVacancyRootCandidate({
        snapDestination,
        sourceWindowRect,
        sourceWindowId,
      }),
    ),
  ]
}

function sourceVacancyRootEdges(
  sourceWindowRect: LayoutRect,
  snapDestinationRects: readonly SnapDestinationLayoutRect[],
) {
  return snapDestinationRects.filter((snapDestination) =>
    sourceWindowIntersectsRootEdge(sourceWindowRect, snapDestination),
  )
}

function tilingSnapCandidate({
  activeDrag,
  rootRect,
  snapDestination,
  sourceWindowId,
}: {
  readonly activeDrag: TilingDragData | null
  readonly rootRect: LayoutRect
  readonly snapDestination: SnapDestinationLayoutRect
  readonly sourceWindowId: WindowId | null
}): readonly TilingDropCandidate[] {
  if (!snapDestinationEnabledForDrag(snapDestination, activeDrag, sourceWindowId)) return []

  const target: TilingDropData = {
    destination: snapDestination.destination,
    kind: 'snap-destination',
  }

  return [
    {
      edge: snapDestination.edge,
      hitRect: snapDestinationHitRect(snapDestination, rootRect),
      id: snapDestination.id,
      kind: snapDestination.kind,
      label: snapDestinationLabel(snapDestination),
      previewRect: snapDestination.rect,
      priority: snapDestinationPriority(snapDestination, rootRect),
      target,
      windowId: snapDestination.windowId,
    },
  ]
}

function sourceReturnCandidate(
  sourceWindowId: WindowId,
  sourceReturnRect: LayoutRect,
): TilingDropCandidate {
  return {
    hitRect: sourceReturnRect,
    id: `snap:source-return:${sourceWindowId}`,
    kind: 'source-return',
    label: 'return home',
    previewRect: sourceReturnRect,
    priority: SOURCE_RETURN_PRIORITY,
    target: {
      kind: 'window',
      windowId: sourceWindowId,
    },
    windowId: sourceWindowId,
  }
}

function sourceVacancyRootCandidate({
  snapDestination,
  sourceWindowId,
  sourceWindowRect,
}: {
  readonly snapDestination: SnapDestinationLayoutRect
  readonly sourceWindowId: WindowId
  readonly sourceWindowRect: LayoutRect
}): TilingDropCandidate {
  const target: TilingDropData = {
    destination: snapDestination.destination,
    kind: 'snap-destination',
  }
  const hitRect = sourceVacancyHitRect(sourceWindowRect, snapDestination.edge)

  return {
    edge: snapDestination.edge,
    hitRect,
    id: `snap:source-vacancy:${sourceWindowId}:${snapDestination.edge}`,
    kind: 'root-edge',
    label: snapDestinationLabel(snapDestination),
    previewRect: hitRect,
    priority: SOURCE_VACANCY_ROOT_PRIORITY,
    target,
    windowId: sourceWindowId,
  }
}

function sourceWindowIntersectsRootEdge(
  sourceWindowRect: LayoutRect,
  snapDestination: SnapDestinationLayoutRect,
) {
  if (snapDestination.kind !== 'root-edge') return false
  if (!snapDestination.edge) return false

  return rectsIntersect(sourceWindowRect, snapDestination.rect)
}

function sourceReturnHitRect(
  sourceWindowRect: LayoutRect,
  rootEdges: readonly SnapDestinationLayoutRect[],
): LayoutRect {
  let rect = sourceWindowRect

  for (const rootEdge of rootEdges) {
    if (!rootEdge.edge) continue

    rect = insetRectEdge(
      rect,
      rootEdge.edge,
      sourceVacancyThickness(sourceWindowRect, rootEdge.edge),
    )
  }

  return rect
}

function sourceVacancyHitRect(sourceWindowRect: LayoutRect, edge: LayoutEdge | undefined) {
  if (!edge) return sourceWindowRect

  const thickness = sourceVacancyThickness(sourceWindowRect, edge)
  if (edge === 'left') return { ...sourceWindowRect, width: thickness }
  if (edge === 'right') {
    return {
      ...sourceWindowRect,
      width: thickness,
      x: rectRight(sourceWindowRect) - thickness,
    }
  }
  if (edge === 'top') return { ...sourceWindowRect, height: thickness }

  return {
    ...sourceWindowRect,
    height: thickness,
    y: rectBottom(sourceWindowRect) - thickness,
  }
}

function sourceVacancyThickness(sourceWindowRect: LayoutRect, edge: LayoutEdge) {
  const size =
    edge === 'left' || edge === 'right' ? sourceWindowRect.width : sourceWindowRect.height
  const preferred = Math.max(SOURCE_VACANCY_EDGE_MIN_PX, size * SOURCE_VACANCY_EDGE_RATIO)
  const sourceSafeMaximum = size * SOURCE_VACANCY_EDGE_SOURCE_MAX_RATIO

  return Math.min(SOURCE_VACANCY_EDGE_MAX_PX, sourceSafeMaximum, preferred)
}

function insetRectEdge(rect: LayoutRect, edge: LayoutEdge, inset: number): LayoutRect {
  if (edge === 'left') return { ...rect, width: Math.max(0, rect.width - inset), x: rect.x + inset }
  if (edge === 'right') return { ...rect, width: Math.max(0, rect.width - inset) }
  if (edge === 'top') {
    return { ...rect, height: Math.max(0, rect.height - inset), y: rect.y + inset }
  }

  return { ...rect, height: Math.max(0, rect.height - inset) }
}

function snapDestinationHitRect(snapDestination: SnapDestinationLayoutRect, rootRect: LayoutRect) {
  if (snapDestination.kind === 'window-edge') return windowEdgeHitRect(snapDestination)
  if (snapDestination.kind !== 'root-edge') return snapDestination.rect
  if (!snapDestination.edge) return snapDestination.rect

  return rootEdgeHitRect(rootRect, snapDestination.edge)
}

function windowEdgeHitRect(snapDestination: SnapDestinationLayoutRect): LayoutRect {
  const edge = snapDestination.edge
  const rect = snapDestination.rect
  if (edge === 'left') return { ...rect, width: edgeHitThickness(rect.width) }
  if (edge === 'right') {
    const width = edgeHitThickness(rect.width)

    return { ...rect, width, x: rectRight(rect) - width }
  }
  if (edge === 'top') return { ...rect, height: edgeHitThickness(rect.height) }

  const height = edgeHitThickness(rect.height)

  return { ...rect, height, y: rectBottom(rect) - height }
}

function edgeHitThickness(size: number) {
  return Math.min(WINDOW_EDGE_HIT_PX, Math.max(1, size))
}

function rootEdgeHitRect(rootRect: LayoutRect, edge: LayoutEdge): LayoutRect {
  if (edge === 'left') {
    return {
      height: rootRect.height + ROOT_EDGE_HIT_OUTSIDE_PX * 2,
      width: ROOT_EDGE_HIT_INSIDE_PX + ROOT_EDGE_HIT_OUTSIDE_PX,
      x: rootRect.x - ROOT_EDGE_HIT_OUTSIDE_PX,
      y: rootRect.y - ROOT_EDGE_HIT_OUTSIDE_PX,
    }
  }
  if (edge === 'right') {
    return {
      height: rootRect.height + ROOT_EDGE_HIT_OUTSIDE_PX * 2,
      width: ROOT_EDGE_HIT_INSIDE_PX + ROOT_EDGE_HIT_OUTSIDE_PX,
      x: rectRight(rootRect) - ROOT_EDGE_HIT_INSIDE_PX,
      y: rootRect.y - ROOT_EDGE_HIT_OUTSIDE_PX,
    }
  }
  if (edge === 'top') {
    return {
      height: ROOT_EDGE_HIT_INSIDE_PX + ROOT_EDGE_HIT_OUTSIDE_PX,
      width: rootRect.width + ROOT_EDGE_HIT_OUTSIDE_PX * 2,
      x: rootRect.x - ROOT_EDGE_HIT_OUTSIDE_PX,
      y: rootRect.y - ROOT_EDGE_HIT_OUTSIDE_PX,
    }
  }

  return {
    height: ROOT_EDGE_HIT_INSIDE_PX + ROOT_EDGE_HIT_OUTSIDE_PX,
    width: rootRect.width + ROOT_EDGE_HIT_OUTSIDE_PX * 2,
    x: rootRect.x - ROOT_EDGE_HIT_OUTSIDE_PX,
    y: rectBottom(rootRect) - ROOT_EDGE_HIT_INSIDE_PX,
  }
}

function snapDestinationEnabledForDrag(
  snapDestination: SnapDestinationLayoutRect,
  activeDrag: TilingDragData | null,
  sourceWindowId: WindowId | null,
) {
  if (!activeDrag) return idleSnapDestinationVisible(snapDestination)
  if (activeDrag.kind === 'tab') return tabSnapDestinationVisible(snapDestination)

  return windowSnapDestinationVisible(snapDestination, sourceWindowId)
}

function idleSnapDestinationVisible(snapDestination: SnapDestinationLayoutRect) {
  if (snapDestination.kind === 'root-edge') return true

  return snapDestination.kind === 'window-edge'
}

function tabSnapDestinationVisible(snapDestination: SnapDestinationLayoutRect) {
  if (snapDestination.kind === 'root-edge') return true

  return snapDestination.kind === 'window-edge'
}

function windowSnapDestinationVisible(
  snapDestination: SnapDestinationLayoutRect,
  sourceWindowId: WindowId | null,
) {
  if (snapDestination.windowId === sourceWindowId) return false
  if (snapDestination.kind === 'root-edge') return true
  if (snapDestination.kind === 'window-edge') return true

  return snapDestination.kind === 'window-center'
}

function snapDestinationPriority(snapDestination: SnapDestinationLayoutRect, rootRect: LayoutRect) {
  if (snapDestination.kind === 'window-center') return WINDOW_CENTER_PRIORITY
  if (snapDestination.kind === 'root-edge') return ROOT_EDGE_PRIORITY
  if (snapDestination.kind === 'window-edge') {
    return windowEdgePriority(snapDestination, rootRect)
  }

  return 0
}

function windowEdgePriority(snapDestination: SnapDestinationLayoutRect, rootRect: LayoutRect) {
  if (outerWindowEdge(snapDestination, rootRect)) return OUTER_WINDOW_EDGE_PRIORITY

  return INTERNAL_WINDOW_EDGE_PRIORITY
}

function outerWindowEdge(snapDestination: SnapDestinationLayoutRect, rootRect: LayoutRect) {
  if (snapDestination.kind !== 'window-edge') return false
  if (snapDestination.edge === 'left') {
    return snapDestination.rect.x <= rootRect.x + OUTER_EDGE_EPSILON_PX
  }
  if (snapDestination.edge === 'right') {
    return rectRight(snapDestination.rect) >= rectRight(rootRect) - OUTER_EDGE_EPSILON_PX
  }
  if (snapDestination.edge === 'top') {
    return snapDestination.rect.y <= rootRect.y + OUTER_EDGE_EPSILON_PX
  }

  return rectBottom(snapDestination.rect) >= rectBottom(rootRect) - OUTER_EDGE_EPSILON_PX
}

function snapDestinationLabel(snapDestination: SnapDestinationLayoutRect) {
  if (snapDestination.kind === 'root-edge') return `root ${snapDestination.edge}`
  if (snapDestination.kind === 'window-edge') return `window ${snapDestination.edge}`
  if (snapDestination.kind === 'window-center') return 'merge tabs'
  if (snapDestination.kind === 'parent-edge') return `parent ${snapDestination.edge}`
  if (snapDestination.kind === 'recipe-slot') return snapDestination.destination.kind

  return snapDestination.kind
}

function rectRight(rect: LayoutRect) {
  return rect.x + rect.width
}

function rectBottom(rect: LayoutRect) {
  return rect.y + rect.height
}

function rectsIntersect(left: LayoutRect, right: LayoutRect) {
  if (rectRight(left) <= right.x) return false
  if (left.x >= rectRight(right)) return false
  if (rectBottom(left) <= right.y) return false

  return left.y < rectBottom(right)
}
