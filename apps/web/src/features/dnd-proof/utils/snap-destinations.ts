import type {
  LayoutRect,
  SnapDestinationLayoutRect,
  WindowLayoutRect,
} from '@/features/tiling-surface-manager/engine/layout-geometry'
import type { DndProofDragData } from '@/features/dnd-proof/utils/drag-data'
import type { WindowId } from '@/features/tiling-surface-manager/engine/layout-types'

export type ProofSnapDestinationRect = Omit<SnapDestinationLayoutRect, 'id' | 'rect'> & {
  readonly id: string
  readonly rect: LayoutRect
}

type SnapEdgeMap = Partial<
  Record<NonNullable<SnapDestinationLayoutRect['edge']>, SnapDestinationLayoutRect>
>

const TAB_HEADER_EXCLUSION_PX = 48
const MIN_SNAP_RECT_SIZE_PX = 12
const OUTER_EDGE_EPSILON_PX = 2
const INTERNAL_EDGE_DUPLICATE_GAP_PX = 24

export function proofSnapDestinations({
  activeDrag,
  rootRect,
  snapDestinationRects,
  sourceWindowId,
  windowRectsById,
}: {
  readonly activeDrag: DndProofDragData | null
  readonly rootRect: LayoutRect
  readonly snapDestinationRects: readonly SnapDestinationLayoutRect[]
  readonly sourceWindowId: WindowId | null
  readonly windowRectsById: Readonly<Record<string, WindowLayoutRect>>
}): readonly ProofSnapDestinationRect[] {
  const rootEdges = edgeMapForSnapDestinations(snapDestinationRects, rootEdgeDestination)
  const windowEdges = windowEdgeMaps(snapDestinationRects)
  const headerRects = tabHeaderRects(windowRectsById)
  const destinations: ProofSnapDestinationRect[] = []

  for (const snapDestination of snapDestinationRects) {
    destinations.push(
      ...snapDestinationRectsForDrag({
        activeDrag,
        headerRects,
        rootEdges,
        rootRect,
        snapDestination,
        sourceWindowId,
        windowEdges,
      }),
    )
  }

  return destinations
}

function snapDestinationRectsForDrag({
  activeDrag,
  headerRects,
  rootEdges,
  rootRect,
  snapDestination,
  sourceWindowId,
  windowEdges,
}: {
  readonly activeDrag: DndProofDragData | null
  readonly headerRects: readonly LayoutRect[]
  readonly rootEdges: SnapEdgeMap
  readonly rootRect: LayoutRect
  readonly snapDestination: SnapDestinationLayoutRect
  readonly sourceWindowId: WindowId | null
  readonly windowEdges: Readonly<Record<string, SnapEdgeMap>>
}): readonly ProofSnapDestinationRect[] {
  if (!snapDestinationEnabledForDrag(snapDestination, activeDrag, sourceWindowId)) return []
  if (outerWindowEdge(snapDestination, rootRect)) return []
  if (
    duplicateInternalWindowEdge(snapDestination, {
      activeDrag,
      rootRect,
      sourceWindowId,
      windowEdges,
    })
  ) {
    return []
  }

  const rect = trimSnapCorners(snapDestination, rootEdges, windowEdges)
  if (!viableRect(rect)) return []

  return splitSnapRectAroundHeaders(snapDestination, rect, activeDrag, headerRects)
}

function snapDestinationEnabledForDrag(
  snapDestination: SnapDestinationLayoutRect,
  activeDrag: DndProofDragData | null,
  sourceWindowId: WindowId | null,
) {
  if (snapDestination.windowId === sourceWindowId) return false
  if (!activeDrag) return idleSnapDestinationVisible(snapDestination)
  if (
    activeDrag.kind === 'tab' &&
    snapDestination.kind === 'window-edge' &&
    snapDestination.edge === 'top'
  ) {
    return false
  }
  if (snapDestination.kind === 'root-edge') return true
  if (snapDestination.kind === 'window-edge') return true
  if (activeDrag.kind === 'window' && snapDestination.kind === 'window-center') return true

  return false
}

function idleSnapDestinationVisible(snapDestination: SnapDestinationLayoutRect) {
  if (snapDestination.kind === 'root-edge') return true

  return snapDestination.kind === 'window-edge'
}

function trimSnapCorners(
  snapDestination: SnapDestinationLayoutRect,
  rootEdges: SnapEdgeMap,
  windowEdges: Readonly<Record<string, SnapEdgeMap>>,
) {
  const edge = snapDestination.edge
  if (!edge) return snapDestination.rect

  const edgeMap =
    snapDestination.kind === 'root-edge'
      ? rootEdges
      : (windowEdges[String(snapDestination.windowId)] ?? {})

  return trimRectCorners(snapDestination.rect, edge, edgeMap)
}

function trimRectCorners(
  rect: LayoutRect,
  edge: NonNullable<SnapDestinationLayoutRect['edge']>,
  edgeMap: SnapEdgeMap,
): LayoutRect {
  if (edge === 'left' || edge === 'right') {
    return verticalEdgeWithoutCorners(rect, edgeMap)
  }

  return horizontalEdgeWithoutCorners(rect, edgeMap)
}

function verticalEdgeWithoutCorners(rect: LayoutRect, edgeMap: SnapEdgeMap): LayoutRect {
  const topInset = edgeMap.top?.rect.height ?? 0
  const bottomInset = edgeMap.bottom?.rect.height ?? 0

  return {
    ...rect,
    height: Math.max(0, rect.height - topInset - bottomInset),
    y: rect.y + topInset,
  }
}

function horizontalEdgeWithoutCorners(rect: LayoutRect, edgeMap: SnapEdgeMap): LayoutRect {
  const leftInset = edgeMap.left?.rect.width ?? 0
  const rightInset = edgeMap.right?.rect.width ?? 0

  return {
    ...rect,
    width: Math.max(0, rect.width - leftInset - rightInset),
    x: rect.x + leftInset,
  }
}

function splitSnapRectAroundHeaders(
  snapDestination: SnapDestinationLayoutRect,
  rect: LayoutRect,
  activeDrag: DndProofDragData | null,
  headerRects: readonly LayoutRect[],
) {
  if (snapDestination.kind === 'root-edge' && snapDestination.edge === 'top') {
    return [proofSnapDestinationRect(snapDestination, rect, 0)]
  }
  if (activeDrag?.kind === 'window') {
    return [proofSnapDestinationRect(snapDestination, rect, 0)]
  }

  return subtractHeaderBands(rect, headerRects).map((segment, index) =>
    proofSnapDestinationRect(snapDestination, segment, index),
  )
}

function subtractHeaderBands(rect: LayoutRect, headerRects: readonly LayoutRect[]) {
  let segments = [rect]

  for (const headerRect of headerRects) {
    segments = segments.flatMap((segment) => splitRectByHeader(segment, headerRect))
  }

  return segments.filter(viableRect)
}

function splitRectByHeader(rect: LayoutRect, headerRect: LayoutRect): readonly LayoutRect[] {
  if (!rectsIntersect(rect, headerRect)) return [rect]

  const intersection = rectIntersection(rect, headerRect)
  if (!intersection) return [rect]

  return rectSegmentsAroundIntersection(rect, intersection).filter(viableRect)
}

function rectSegmentsAroundIntersection(
  rect: LayoutRect,
  intersection: LayoutRect,
): readonly LayoutRect[] {
  const intersectionBottom = rectBottom(intersection)
  const intersectionRight = rectRight(intersection)

  return [
    { ...rect, height: intersection.y - rect.y },
    { ...rect, height: rectBottom(rect) - intersectionBottom, y: intersectionBottom },
    {
      height: intersection.height,
      width: intersection.x - rect.x,
      x: rect.x,
      y: intersection.y,
    },
    {
      height: intersection.height,
      width: rectRight(rect) - intersectionRight,
      x: intersectionRight,
      y: intersection.y,
    },
  ]
}

function rectIntersection(left: LayoutRect, right: LayoutRect): LayoutRect | null {
  const x = Math.max(left.x, right.x)
  const y = Math.max(left.y, right.y)
  const maxRight = Math.min(rectRight(left), rectRight(right))
  const maxBottom = Math.min(rectBottom(left), rectBottom(right))
  if (maxRight <= x) return null
  if (maxBottom <= y) return null

  return {
    height: maxBottom - y,
    width: maxRight - x,
    x,
    y,
  }
}

function proofSnapDestinationRect(
  snapDestination: SnapDestinationLayoutRect,
  rect: LayoutRect,
  segmentIndex: number,
): ProofSnapDestinationRect {
  return {
    ...snapDestination,
    id: `${snapDestination.id}:${segmentIndex}`,
    rect,
  }
}

function edgeMapForSnapDestinations(
  snapDestinationRects: readonly SnapDestinationLayoutRect[],
  predicate: (snapDestination: SnapDestinationLayoutRect) => boolean,
) {
  const edgeMap: SnapEdgeMap = {}

  for (const snapDestination of snapDestinationRects) {
    if (!predicate(snapDestination)) continue
    if (!snapDestination.edge) continue

    edgeMap[snapDestination.edge] = snapDestination
  }

  return edgeMap
}

function windowEdgeMaps(snapDestinationRects: readonly SnapDestinationLayoutRect[]) {
  const edgeMaps: Record<string, SnapEdgeMap> = {}

  for (const snapDestination of snapDestinationRects) {
    if (snapDestination.kind !== 'window-edge') continue
    if (!snapDestination.windowId) continue
    if (!snapDestination.edge) continue

    edgeMaps[snapDestination.windowId] ??= {}
    edgeMaps[snapDestination.windowId][snapDestination.edge] = snapDestination
  }

  return edgeMaps
}

function rootEdgeDestination(snapDestination: SnapDestinationLayoutRect) {
  return snapDestination.kind === 'root-edge'
}

function outerWindowEdge(snapDestination: SnapDestinationLayoutRect, rootRect: LayoutRect) {
  if (snapDestination.kind !== 'window-edge') return false
  if (snapDestination.edge === 'left')
    return snapDestination.rect.x <= rootRect.x + OUTER_EDGE_EPSILON_PX
  if (snapDestination.edge === 'right') {
    return rectRight(snapDestination.rect) >= rectRight(rootRect) - OUTER_EDGE_EPSILON_PX
  }
  if (snapDestination.edge === 'top')
    return snapDestination.rect.y <= rootRect.y + OUTER_EDGE_EPSILON_PX

  return rectBottom(snapDestination.rect) >= rectBottom(rootRect) - OUTER_EDGE_EPSILON_PX
}

function duplicateInternalWindowEdge(
  snapDestination: SnapDestinationLayoutRect,
  context: {
    readonly activeDrag: DndProofDragData | null
    readonly rootRect: LayoutRect
    readonly sourceWindowId: WindowId | null
    readonly windowEdges: Readonly<Record<string, SnapEdgeMap>>
  },
) {
  if (snapDestination.kind !== 'window-edge') return false
  if (snapDestination.edge === 'left') {
    return enabledPeerEdgeExists(snapDestination, 'right', context, horizontalEdgesAdjacent)
  }
  if (snapDestination.edge === 'top') {
    return enabledPeerEdgeExists(snapDestination, 'bottom', context, verticalEdgesAdjacent)
  }

  return false
}

function enabledPeerEdgeExists(
  snapDestination: SnapDestinationLayoutRect,
  peerEdge: NonNullable<SnapDestinationLayoutRect['edge']>,
  context: {
    readonly activeDrag: DndProofDragData | null
    readonly rootRect: LayoutRect
    readonly sourceWindowId: WindowId | null
    readonly windowEdges: Readonly<Record<string, SnapEdgeMap>>
  },
  adjacent: (leading: LayoutRect, trailing: LayoutRect) => boolean,
) {
  for (const edgeMap of Object.values(context.windowEdges)) {
    const peer = edgeMap[peerEdge]
    if (!peer) continue
    if (peer.windowId === snapDestination.windowId) continue
    if (!snapDestinationEnabledForDrag(peer, context.activeDrag, context.sourceWindowId)) continue
    if (outerWindowEdge(peer, context.rootRect)) continue
    if (!adjacent(peer.rect, snapDestination.rect)) continue

    return true
  }

  return false
}

function horizontalEdgesAdjacent(leading: LayoutRect, trailing: LayoutRect) {
  if (!rectsOverlapVertically(leading, trailing)) return false

  const gap = trailing.x - rectRight(leading)

  return gap >= -OUTER_EDGE_EPSILON_PX && gap <= INTERNAL_EDGE_DUPLICATE_GAP_PX
}

function verticalEdgesAdjacent(leading: LayoutRect, trailing: LayoutRect) {
  if (!rectsOverlapHorizontally(leading, trailing)) return false

  const gap = trailing.y - rectBottom(leading)

  return gap >= -OUTER_EDGE_EPSILON_PX && gap <= INTERNAL_EDGE_DUPLICATE_GAP_PX
}

function rectsOverlapVertically(left: LayoutRect, right: LayoutRect) {
  return rangeOverlap(left.y, rectBottom(left), right.y, rectBottom(right)) > OUTER_EDGE_EPSILON_PX
}

function rectsOverlapHorizontally(left: LayoutRect, right: LayoutRect) {
  return rangeOverlap(left.x, rectRight(left), right.x, rectRight(right)) > OUTER_EDGE_EPSILON_PX
}

function rangeOverlap(leftStart: number, leftEnd: number, rightStart: number, rightEnd: number) {
  return Math.min(leftEnd, rightEnd) - Math.max(leftStart, rightStart)
}

function tabHeaderRects(
  windowRectsById: Readonly<Record<string, WindowLayoutRect>>,
): readonly LayoutRect[] {
  return Object.values(windowRectsById).map((windowRect) => ({
    height: Math.min(windowRect.rect.height, TAB_HEADER_EXCLUSION_PX),
    width: windowRect.rect.width,
    x: windowRect.rect.x,
    y: windowRect.rect.y,
  }))
}

function rectsIntersect(left: LayoutRect, right: LayoutRect) {
  if (rectRight(left) <= right.x) return false
  if (rectRight(right) <= left.x) return false
  if (rectBottom(left) <= right.y) return false

  return rectBottom(right) > left.y
}

function viableRect(rect: LayoutRect) {
  if (rect.height < MIN_SNAP_RECT_SIZE_PX) return false

  return rect.width >= MIN_SNAP_RECT_SIZE_PX
}

function rectRight(rect: LayoutRect) {
  return rect.x + rect.width
}

function rectBottom(rect: LayoutRect) {
  return rect.y + rect.height
}
