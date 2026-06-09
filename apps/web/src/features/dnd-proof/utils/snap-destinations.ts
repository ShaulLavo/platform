import type { DndProofDragData, DndProofDropData } from '@/features/dnd-proof/utils/drag-data'
import type {
  LayoutRect,
  SnapDestinationLayoutRect,
} from '@/features/tiling-surface-manager/engine/layout-geometry'
import type { LayoutEdge, WindowId } from '@/features/tiling-surface-manager/engine/layout-types'

export type DndProofDropCandidate = {
  readonly edge?: LayoutEdge
  readonly hitRect: LayoutRect
  readonly id: string
  readonly kind: SnapDestinationLayoutRect['kind']
  readonly label: string
  readonly previewRect: LayoutRect
  readonly priority: number
  readonly target: DndProofDropData
  readonly windowId?: WindowId
}

const OUTER_EDGE_EPSILON_PX = 2
const ROOT_EDGE_PRIORITY = 95
const INTERNAL_WINDOW_EDGE_PRIORITY = 90
const OUTER_WINDOW_EDGE_PRIORITY = 88
const WINDOW_CENTER_PRIORITY = 100
const ROOT_EDGE_HIT_INSIDE_PX = 10
const ROOT_EDGE_HIT_OUTSIDE_PX = 28
const WINDOW_TOP_HIT_EXTRA_PX = 48

export function proofSnapDestinations({
  activeDrag,
  rootRect,
  snapDestinationRects,
  sourceWindowId,
}: {
  readonly activeDrag: DndProofDragData | null
  readonly rootRect: LayoutRect
  readonly snapDestinationRects: readonly SnapDestinationLayoutRect[]
  readonly sourceWindowId: WindowId | null
}): readonly DndProofDropCandidate[] {
  return snapDestinationRects.flatMap((snapDestination) =>
    proofSnapCandidate({
      activeDrag,
      rootRect,
      snapDestination,
      sourceWindowId,
    }),
  )
}

function proofSnapCandidate({
  activeDrag,
  rootRect,
  snapDestination,
  sourceWindowId,
}: {
  readonly activeDrag: DndProofDragData | null
  readonly rootRect: LayoutRect
  readonly snapDestination: SnapDestinationLayoutRect
  readonly sourceWindowId: WindowId | null
}): readonly DndProofDropCandidate[] {
  if (!snapDestinationEnabledForDrag(snapDestination, activeDrag, sourceWindowId)) return []

  const target: DndProofDropData = {
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

function snapDestinationHitRect(snapDestination: SnapDestinationLayoutRect, rootRect: LayoutRect) {
  if (snapDestination.kind === 'window-edge' && snapDestination.edge === 'top') {
    return {
      ...snapDestination.rect,
      height: snapDestination.rect.height + WINDOW_TOP_HIT_EXTRA_PX,
    }
  }
  if (snapDestination.kind !== 'root-edge') return snapDestination.rect
  if (!snapDestination.edge) return snapDestination.rect

  return rootEdgeHitRect(rootRect, snapDestination.edge)
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
  activeDrag: DndProofDragData | null,
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
