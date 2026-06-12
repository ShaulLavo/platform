import { overlayId } from '@workspace/tiling/utils/layout-ids'
import {
  edgeAxis,
  findNodeIdForWindow,
  repairSplitSizes,
  visibleWindowIdsInOrder,
} from '@workspace/tiling/utils/layout-normalize'
import type {
  SnapDestination,
  LayoutEdge,
  LayoutNode,
  LayoutNodeId,
  LayoutSplitAxis,
  OverlayId,
  WindowId,
  WorkspaceLayout,
} from '@workspace/tiling/utils/layout-types'

export type LayoutRect = {
  readonly height: number
  readonly width: number
  readonly x: number
  readonly y: number
}

export type WindowLayoutRect = {
  readonly nodeId: LayoutNodeId
  readonly rect: LayoutRect
  readonly windowId: WindowId
}

export type ResizeHandleLayoutRect = {
  readonly axis: LayoutSplitAxis
  readonly handleIndex: number
  readonly id: OverlayId
  readonly rect: LayoutRect
  readonly resizeReferencePx: number
  readonly splitId: LayoutNodeId
}

export type SnapDestinationLayoutRect = {
  readonly destination: SnapDestination
  readonly edge?: LayoutEdge
  readonly id: OverlayId
  readonly kind: 'background' | 'parent-edge' | 'root-edge' | 'window-center' | 'window-edge'
  readonly rect: LayoutRect
  readonly windowId?: WindowId
}

export type LayoutGeometry = {
  readonly nodeRectsById: Readonly<Record<string, LayoutRect>>
  readonly resizeHandleRects: readonly ResizeHandleLayoutRect[]
  readonly snapDestinationRects: readonly SnapDestinationLayoutRect[]
  readonly windowRectsById: Readonly<Record<string, WindowLayoutRect>>
}

export type LayoutGeometryOptions = {
  readonly collapsedWindowHeaderPx?: number
  readonly gapPx?: number
  readonly minSnapDestinationPx?: number
  readonly resizeHandleThicknessPx?: number
  readonly snapEdgeRatio?: number
}

const DEFAULT_COLLAPSED_WINDOW_HEADER_PX = 40
const DEFAULT_RESIZE_HANDLE_THICKNESS_PX = 6
const DEFAULT_SNAP_EDGE_RATIO = 0.25
const DEFAULT_MIN_SNAP_DESTINATION_PX = 32

export function insetLayoutRect(rect: LayoutRect, insetPx: number): LayoutRect {
  const inset = Math.min(Math.max(0, insetPx), rect.width / 2, rect.height / 2)

  return {
    height: Math.max(0, rect.height - inset * 2),
    width: Math.max(0, rect.width - inset * 2),
    x: rect.x + inset,
    y: rect.y + inset,
  }
}

export function deriveLayoutGeometry(
  layout: WorkspaceLayout,
  rootRect: LayoutRect,
  options: LayoutGeometryOptions = {},
): LayoutGeometry {
  const nodeRectsById = deriveNodeRects(layout, rootRect, options)
  const windowRectsById = deriveWindowRects(layout, nodeRectsById)
  const snapDestinationRects = deriveSnapDestinationRects(
    layout,
    rootRect,
    nodeRectsById,
    windowRectsById,
    options,
  )
  const resizeHandleRects = deriveResizeHandleRects(layout, nodeRectsById, options)
  return {
    nodeRectsById,
    resizeHandleRects,
    snapDestinationRects,
    windowRectsById,
  }
}

export function deriveNodeRects(
  layout: WorkspaceLayout,
  rootRect: LayoutRect,
  options: LayoutGeometryOptions = {},
): Readonly<Record<string, LayoutRect>> {
  const nodeRectsById: Record<string, LayoutRect> = {}
  if (!layout.rootNodeId) return nodeRectsById

  assignNodeRect(
    layout,
    layout.rootNodeId,
    rootRect,
    nodeRectsById,
    options.gapPx ?? 0,
    options.collapsedWindowHeaderPx ?? DEFAULT_COLLAPSED_WINDOW_HEADER_PX,
    true,
  )
  return nodeRectsById
}

export function deriveWindowRects(
  layout: WorkspaceLayout,
  nodeRectsById: Readonly<Record<string, LayoutRect>>,
): Readonly<Record<string, WindowLayoutRect>> {
  const windowRectsById: Record<string, WindowLayoutRect> = {}

  for (const windowId of visibleWindowIdsInOrder(layout)) {
    const nodeId = findNodeIdForWindow(layout, windowId)
    if (!nodeId) continue

    const rect = nodeRectsById[nodeId]
    if (!rect) continue

    windowRectsById[windowId] = { nodeId, rect, windowId }
  }

  return windowRectsById
}

export function deriveResizeHandleRects(
  layout: WorkspaceLayout,
  nodeRectsById: Readonly<Record<string, LayoutRect>>,
  options: LayoutGeometryOptions = {},
): readonly ResizeHandleLayoutRect[] {
  const handleRects: ResizeHandleLayoutRect[] = []

  for (const node of Object.values(layout.nodesById)) {
    if (node.kind !== 'split') continue

    handleRects.push(...resizeHandleRectsForSplit(layout, node, nodeRectsById, options))
  }

  return handleRects
}

export function deriveSnapDestinationRects(
  layout: WorkspaceLayout,
  rootRect: LayoutRect,
  nodeRectsById: Readonly<Record<string, LayoutRect>>,
  windowRectsById: Readonly<Record<string, WindowLayoutRect>>,
  options: LayoutGeometryOptions = {},
): readonly SnapDestinationLayoutRect[] {
  // TODO(recipe-return): recipe-slot drop zones were removed because their huge
  // top-priority hit rects swallowed real drop targets and made drags feel dead.
  // Reintroduce "return to recipe slot" as a small, visible dock target (e.g. the
  // rail) instead of a screen-region field.
  return [
    backgroundSnapDestinationRect(rootRect),
    ...rootEdgeSnapDestinationRects(rootRect, options),
    ...windowSnapDestinationRects(windowRectsById, options),
    ...parentEdgeSnapDestinationRects(layout, nodeRectsById, options),
  ]
}

function assignNodeRect(
  layout: WorkspaceLayout,
  nodeId: LayoutNodeId,
  rect: LayoutRect,
  nodeRectsById: Record<string, LayoutRect>,
  gapPx: number,
  collapsedWindowHeaderPx: number,
  isRootNode: boolean,
) {
  const node = layout.nodesById[nodeId]
  if (!node) return

  if (node.kind === 'window') {
    nodeRectsById[nodeId] = windowNodeRect(layout, node, rect, collapsedWindowHeaderPx, isRootNode)
    return
  }

  nodeRectsById[nodeId] = rect
  const childRects = childRectsForSplit(layout, node, rect, gapPx, collapsedWindowHeaderPx)
  node.childIds.forEach((childId, index) => {
    const childRect = childRects[index]
    if (!childRect) return

    assignNodeRect(layout, childId, childRect, nodeRectsById, gapPx, collapsedWindowHeaderPx, false)
  })
}

function windowNodeRect(
  layout: WorkspaceLayout,
  node: Extract<LayoutNode, { readonly kind: 'window' }>,
  rect: LayoutRect,
  collapsedWindowHeaderPx: number,
  isRootNode: boolean,
): LayoutRect {
  if (!isRootNode) return rect
  const window = layout.windowsById[node.windowId]
  if (window?.mode !== 'collapsed') return rect

  return collapsedWindowRect(rect, collapsedWindowHeaderPx, window.collapsedEdge)
}

function collapsedWindowRect(
  rect: LayoutRect,
  collapsedWindowHeaderPx: number,
  edge: LayoutEdge | undefined,
): LayoutRect {
  const size = Math.max(0, collapsedWindowHeaderPx)
  if (edge === 'left') return { ...rect, width: Math.min(rect.width, size) }
  if (edge === 'right') {
    const width = Math.min(rect.width, size)

    return { ...rect, width, x: rect.x + rect.width - width }
  }
  if (edge === 'bottom') {
    const height = Math.min(rect.height, size)

    return { ...rect, height, y: rect.y + rect.height - height }
  }

  return {
    ...rect,
    height: Math.min(rect.height, size),
  }
}

function childRectsForSplit(
  layout: WorkspaceLayout,
  node: Extract<LayoutNode, { readonly kind: 'split' }>,
  rect: LayoutRect,
  gapPx: number,
  collapsedWindowHeaderPx: number,
) {
  const sizes = splitChildMainSizes(layout, node, rect, gapPx, collapsedWindowHeaderPx)
  const crossSize = node.axis === 'horizontal' ? rect.height : rect.width
  let cursor = node.axis === 'horizontal' ? rect.x : rect.y

  return sizes.map((childMainSize) => {
    const childRect = splitChildRect(node.axis, rect, cursor, childMainSize, crossSize)
    cursor += childMainSize + gapPx

    return childRect
  })
}

function splitChildMainSizes(
  layout: WorkspaceLayout,
  node: Extract<LayoutNode, { readonly kind: 'split' }>,
  rect: LayoutRect,
  gapPx: number,
  collapsedWindowHeaderPx: number,
) {
  const flexibleRatios = repairSplitSizes(node.sizes, node.childIds.length)
  const availableMainSize = splitAvailableMainSize(node, rect, gapPx)
  const fixedSizes = collapsedChildMainSizes(layout, node, collapsedWindowHeaderPx)
  const totalFixedSize = sumFixedSizes(fixedSizes)
  if (totalFixedSize > availableMainSize) {
    return constrainedFixedMainSizes(fixedSizes, availableMainSize)
  }

  const flexibleMainSize = availableMainSize - totalFixedSize
  const flexibleRatioTotal = flexibleRatios.reduce(
    (sum, ratio, index) => sum + (fixedSizes[index] === null ? ratio : 0),
    0,
  )

  return flexibleRatios.map((ratio, index) => {
    const fixedSize = fixedSizes[index]
    if (fixedSize !== null) return fixedSize
    if (flexibleRatioTotal <= 0) return 0

    return flexibleMainSize * (ratio / flexibleRatioTotal)
  })
}

function splitAvailableMainSize(
  node: Extract<LayoutNode, { readonly kind: 'split' }>,
  rect: LayoutRect,
  gapPx: number,
) {
  const mainSize = splitMainSize(node.axis, rect)

  return Math.max(0, mainSize - gapPx * Math.max(0, node.childIds.length - 1))
}

function sumFixedSizes(sizes: readonly (number | null)[]) {
  return sizes.reduce<number>((sum, size) => sum + (size ?? 0), 0)
}

function collapsedChildMainSizes(
  layout: WorkspaceLayout,
  node: Extract<LayoutNode, { readonly kind: 'split' }>,
  collapsedWindowHeaderPx: number,
) {
  return node.childIds.map((childId) =>
    collapsedChildMainSize(layout, childId, collapsedWindowHeaderPx),
  )
}

function collapsedChildMainSize(
  layout: WorkspaceLayout,
  childId: LayoutNodeId,
  collapsedWindowHeaderPx: number,
) {
  const child = layout.nodesById[childId]
  if (!child || child.kind !== 'window') return null

  const window = layout.windowsById[child.windowId]
  if (window?.mode !== 'collapsed') return null

  return Math.max(0, collapsedWindowHeaderPx)
}

function constrainedFixedMainSizes(
  fixedSizes: readonly (number | null)[],
  availableMainSize: number,
) {
  const fixedCount = fixedSizes.filter((size) => size !== null).length
  const constrainedSize = fixedCount > 0 ? availableMainSize / fixedCount : 0

  return fixedSizes.map((size) => (size === null ? 0 : constrainedSize))
}

function splitChildRect(
  axis: LayoutSplitAxis,
  rect: LayoutRect,
  cursor: number,
  mainSize: number,
  crossSize: number,
): LayoutRect {
  if (axis === 'horizontal') {
    return { height: crossSize, width: mainSize, x: cursor, y: rect.y }
  }

  return { height: mainSize, width: crossSize, x: rect.x, y: cursor }
}

function resizeHandleRectsForSplit(
  layout: WorkspaceLayout,
  node: Extract<LayoutNode, { readonly kind: 'split' }>,
  nodeRectsById: Readonly<Record<string, LayoutRect>>,
  options: LayoutGeometryOptions,
) {
  const handles: ResizeHandleLayoutRect[] = []

  for (let index = 0; index < node.childIds.length - 1; index += 1) {
    const handleRect = resizeHandleRectForIndex(layout, node, nodeRectsById, index, options)
    if (!handleRect) continue

    handles.push(handleRect)
  }

  return handles
}

function resizeHandleRectForIndex(
  layout: WorkspaceLayout,
  node: Extract<LayoutNode, { readonly kind: 'split' }>,
  nodeRectsById: Readonly<Record<string, LayoutRect>>,
  handleIndex: number,
  options: LayoutGeometryOptions,
): ResizeHandleLayoutRect | null {
  const before = nodeRectsById[node.childIds[handleIndex]]
  const after = nodeRectsById[node.childIds[handleIndex + 1]]
  const splitRect = nodeRectsById[node.id]
  if (!before || !after || !splitRect) return null

  return {
    axis: node.axis,
    handleIndex,
    id: overlayId(`resize:${node.id}:${handleIndex}`),
    rect: handleRectBetween(before, after, splitRect, node.axis, options),
    resizeReferencePx: resizeReferencePxForSplit(layout, node, nodeRectsById, splitRect, options),
    splitId: node.id,
  }
}

function resizeReferencePxForSplit(
  layout: WorkspaceLayout,
  node: Extract<LayoutNode, { readonly kind: 'split' }>,
  nodeRectsById: Readonly<Record<string, LayoutRect>>,
  splitRect: LayoutRect,
  options: LayoutGeometryOptions,
) {
  const collapsedWindowHeaderPx =
    options.collapsedWindowHeaderPx ?? DEFAULT_COLLAPSED_WINDOW_HEADER_PX
  const availableMainSize = renderedChildMainSizeTotal(node, nodeRectsById, splitRect)
  const fixedSizes = collapsedChildMainSizes(layout, node, collapsedWindowHeaderPx)
  const flexibleMainSize = availableMainSize - sumFixedSizes(fixedSizes)
  if (flexibleMainSize <= 0) return Math.max(1, availableMainSize)

  const flexibleRatioTotal = flexibleResizeRatioTotal(node, fixedSizes)
  if (flexibleRatioTotal <= 0) return Math.max(1, flexibleMainSize)

  return Math.max(1, flexibleMainSize / flexibleRatioTotal)
}

function renderedChildMainSizeTotal(
  node: Extract<LayoutNode, { readonly kind: 'split' }>,
  nodeRectsById: Readonly<Record<string, LayoutRect>>,
  splitRect: LayoutRect,
) {
  const total = node.childIds.reduce((sum, childId) => {
    const rect = nodeRectsById[childId]
    if (!rect) return sum

    return sum + splitMainSize(node.axis, rect)
  }, 0)
  if (total > 0) return total

  return splitMainSize(node.axis, splitRect)
}

function splitMainSize(axis: LayoutSplitAxis, rect: LayoutRect) {
  if (axis === 'horizontal') return rect.width

  return rect.height
}

function flexibleResizeRatioTotal(
  node: Extract<LayoutNode, { readonly kind: 'split' }>,
  fixedSizes: readonly (number | null)[],
) {
  const ratios = repairSplitSizes(node.sizes, node.childIds.length)

  return ratios.reduce<number>((sum, ratio, index) => {
    if (fixedSizes[index] !== null) return sum

    return sum + ratio
  }, 0)
}

function handleRectBetween(
  before: LayoutRect,
  after: LayoutRect,
  splitRect: LayoutRect,
  axis: LayoutSplitAxis,
  options: LayoutGeometryOptions,
) {
  const thickness = options.resizeHandleThicknessPx ?? DEFAULT_RESIZE_HANDLE_THICKNESS_PX
  if (axis === 'horizontal') {
    const centerX = (before.x + before.width + after.x) / 2
    return {
      height: splitRect.height,
      width: thickness,
      x: centerX - thickness / 2,
      y: splitRect.y,
    }
  }

  const centerY = (before.y + before.height + after.y) / 2
  return { height: thickness, width: splitRect.width, x: splitRect.x, y: centerY - thickness / 2 }
}

function backgroundSnapDestinationRect(rootRect: LayoutRect): SnapDestinationLayoutRect {
  return {
    destination: { kind: 'background' },
    id: overlayId('snap:background'),
    kind: 'background',
    rect: insetLayoutRect(rootRect, Math.min(rootRect.width, rootRect.height) * 0.35),
  }
}

function rootEdgeSnapDestinationRects(
  rootRect: LayoutRect,
  options: LayoutGeometryOptions,
): readonly SnapDestinationLayoutRect[] {
  return snapEdges().map((edge) => ({
    destination: { edge, kind: 'root-edge' },
    edge,
    id: overlayId(`snap:root:${edge}`),
    kind: 'root-edge',
    rect: edgeRect(rootRect, edge, edgeThickness(rootRect, edge, options)),
  }))
}

function windowSnapDestinationRects(
  windowRectsById: Readonly<Record<string, WindowLayoutRect>>,
  options: LayoutGeometryOptions,
): readonly SnapDestinationLayoutRect[] {
  return Object.values(windowRectsById).flatMap((windowRect) =>
    windowSnapDestinationRectsForWindow(windowRect, options),
  )
}

function windowSnapDestinationRectsForWindow(
  windowRect: WindowLayoutRect,
  options: LayoutGeometryOptions,
): readonly SnapDestinationLayoutRect[] {
  const edgeZones = snapEdges().map((edge) => ({
    destination: { edge, kind: 'window-edge' as const, windowId: windowRect.windowId },
    edge,
    id: overlayId(`snap:window:${windowRect.windowId}:${edge}`),
    kind: 'window-edge' as const,
    rect: edgeRect(windowRect.rect, edge, edgeThickness(windowRect.rect, edge, options)),
    windowId: windowRect.windowId,
  }))

  return [
    {
      destination: { kind: 'window-center', windowId: windowRect.windowId },
      id: overlayId(`snap:window:${windowRect.windowId}:center`),
      kind: 'window-center',
      rect: centerRect(windowRect.rect, options),
      windowId: windowRect.windowId,
    },
    ...edgeZones,
  ]
}

function parentEdgeSnapDestinationRects(
  layout: WorkspaceLayout,
  nodeRectsById: Readonly<Record<string, LayoutRect>>,
  options: LayoutGeometryOptions,
): readonly SnapDestinationLayoutRect[] {
  const destinations: SnapDestinationLayoutRect[] = []

  for (const node of Object.values(layout.nodesById)) {
    if (node.id === layout.rootNodeId) continue

    const rect = nodeRectsById[node.id]
    if (!rect) continue

    destinations.push(...parentEdgeSnapDestinationRectsForNode(node.id, rect, options))
  }

  return destinations
}

function parentEdgeSnapDestinationRectsForNode(
  nodeId: LayoutNodeId,
  rect: LayoutRect,
  options: LayoutGeometryOptions,
) {
  return snapEdges().map((edge) => ({
    destination: { edge, kind: 'parent-edge' as const, nodeId },
    edge,
    id: overlayId(`snap:parent:${nodeId}:${edge}`),
    kind: 'parent-edge' as const,
    rect: edgeRect(rect, edge, edgeThickness(rect, edge, options)),
  }))
}

function centerRect(rect: LayoutRect, options: LayoutGeometryOptions): LayoutRect {
  const horizontalInset = edgeThickness(rect, 'left', options)
  const verticalInset = edgeThickness(rect, 'top', options)

  return {
    height: Math.max(0, rect.height - verticalInset * 2),
    width: Math.max(0, rect.width - horizontalInset * 2),
    x: rect.x + horizontalInset,
    y: rect.y + verticalInset,
  }
}

function edgeRect(rect: LayoutRect, edge: LayoutEdge, thickness: number): LayoutRect {
  if (edge === 'left') return { height: rect.height, width: thickness, x: rect.x, y: rect.y }
  if (edge === 'right') {
    return { height: rect.height, width: thickness, x: rect.x + rect.width - thickness, y: rect.y }
  }
  if (edge === 'top') return { height: thickness, width: rect.width, x: rect.x, y: rect.y }

  return { height: thickness, width: rect.width, x: rect.x, y: rect.y + rect.height - thickness }
}

function edgeThickness(rect: LayoutRect, edge: LayoutEdge, options: LayoutGeometryOptions) {
  const size = edgeAxis(edge) === 'horizontal' ? rect.width : rect.height
  const ratio = options.snapEdgeRatio ?? DEFAULT_SNAP_EDGE_RATIO
  const minimum = options.minSnapDestinationPx ?? DEFAULT_MIN_SNAP_DESTINATION_PX

  return Math.min(size / 2, Math.max(minimum, size * ratio))
}

function snapEdges(): readonly LayoutEdge[] {
  return ['left', 'right', 'top', 'bottom']
}
