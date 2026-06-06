import { overlayId } from './layout-ids'
import {
  edgeAxis,
  findNodeIdForWindow,
  repairSplitSizes,
  visibleWindowIdsInOrder,
} from './layout-normalize'
import type {
  DropDestination,
  DropEdge,
  LayoutNode,
  LayoutNodeId,
  LayoutSplitAxis,
  OverlayId,
  WindowId,
  WorkspaceLayout,
} from './layout-types'

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
  readonly splitId: LayoutNodeId
}

export type DropZoneLayoutRect = {
  readonly destination: DropDestination
  readonly edge?: DropEdge
  readonly id: OverlayId
  readonly kind: 'parent-edge' | 'root-edge' | 'window-center' | 'window-edge'
  readonly rect: LayoutRect
  readonly windowId?: WindowId
}

export type LayoutGeometry = {
  readonly dropZoneRects: readonly DropZoneLayoutRect[]
  readonly nodeRectsById: Readonly<Record<string, LayoutRect>>
  readonly resizeHandleRects: readonly ResizeHandleLayoutRect[]
  readonly windowRectsById: Readonly<Record<string, WindowLayoutRect>>
}

export type LayoutGeometryOptions = {
  readonly dropEdgeRatio?: number
  readonly gapPx?: number
  readonly minDropZonePx?: number
  readonly resizeHandleThicknessPx?: number
}

const DEFAULT_DROP_EDGE_RATIO = 0.25
const DEFAULT_MIN_DROP_ZONE_PX = 32
const DEFAULT_RESIZE_HANDLE_THICKNESS_PX = 6

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
  const dropZoneRects = deriveDropZoneRects(
    layout,
    rootRect,
    nodeRectsById,
    windowRectsById,
    options,
  )
  const resizeHandleRects = deriveResizeHandleRects(layout, nodeRectsById, options)
  return {
    dropZoneRects,
    nodeRectsById,
    resizeHandleRects,
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

  assignNodeRect(layout, layout.rootNodeId, rootRect, nodeRectsById, options.gapPx ?? 0)
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

export function deriveDropZoneRects(
  layout: WorkspaceLayout,
  rootRect: LayoutRect,
  nodeRectsById: Readonly<Record<string, LayoutRect>>,
  windowRectsById: Readonly<Record<string, WindowLayoutRect>>,
  options: LayoutGeometryOptions = {},
): readonly DropZoneLayoutRect[] {
  return [
    ...rootEdgeDropZoneRects(rootRect, options),
    ...windowDropZoneRects(windowRectsById, options),
    ...parentEdgeDropZoneRects(layout, nodeRectsById, options),
  ]
}

function assignNodeRect(
  layout: WorkspaceLayout,
  nodeId: LayoutNodeId,
  rect: LayoutRect,
  nodeRectsById: Record<string, LayoutRect>,
  gapPx: number,
) {
  const node = layout.nodesById[nodeId]
  if (!node) return

  nodeRectsById[nodeId] = rect
  if (node.kind === 'window') return

  const childRects = childRectsForSplit(node, rect, gapPx)
  node.childIds.forEach((childId, index) => {
    const childRect = childRects[index]
    if (!childRect) return

    assignNodeRect(layout, childId, childRect, nodeRectsById, gapPx)
  })
}

function childRectsForSplit(
  node: Extract<LayoutNode, { readonly kind: 'split' }>,
  rect: LayoutRect,
  gapPx: number,
) {
  const sizes = repairSplitSizes(node.sizes, node.childIds.length)
  const mainSize = node.axis === 'horizontal' ? rect.width : rect.height
  const crossSize = node.axis === 'horizontal' ? rect.height : rect.width
  const availableMainSize = Math.max(0, mainSize - gapPx * Math.max(0, sizes.length - 1))
  let cursor = node.axis === 'horizontal' ? rect.x : rect.y

  return sizes.map((size) => {
    const childMainSize = availableMainSize * size
    const childRect = splitChildRect(node.axis, rect, cursor, childMainSize, crossSize)
    cursor += childMainSize + gapPx

    return childRect
  })
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
  _layout: WorkspaceLayout,
  node: Extract<LayoutNode, { readonly kind: 'split' }>,
  nodeRectsById: Readonly<Record<string, LayoutRect>>,
  options: LayoutGeometryOptions,
) {
  const handles: ResizeHandleLayoutRect[] = []

  for (let index = 0; index < node.childIds.length - 1; index += 1) {
    const handleRect = resizeHandleRectForIndex(node, nodeRectsById, index, options)
    if (!handleRect) continue

    handles.push(handleRect)
  }

  return handles
}

function resizeHandleRectForIndex(
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
    splitId: node.id,
  }
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

function rootEdgeDropZoneRects(
  rootRect: LayoutRect,
  options: LayoutGeometryOptions,
): readonly DropZoneLayoutRect[] {
  return dropEdges().map((edge) => ({
    destination: { edge, kind: 'root-edge' },
    edge,
    id: overlayId(`drop:root:${edge}`),
    kind: 'root-edge',
    rect: edgeRect(rootRect, edge, edgeThickness(rootRect, edge, options)),
  }))
}

function windowDropZoneRects(
  windowRectsById: Readonly<Record<string, WindowLayoutRect>>,
  options: LayoutGeometryOptions,
): readonly DropZoneLayoutRect[] {
  return Object.values(windowRectsById).flatMap((windowRect) =>
    windowDropZoneRectsForWindow(windowRect, options),
  )
}

function windowDropZoneRectsForWindow(
  windowRect: WindowLayoutRect,
  options: LayoutGeometryOptions,
): readonly DropZoneLayoutRect[] {
  const edgeZones = dropEdges().map((edge) => ({
    destination: { edge, kind: 'window-edge' as const, windowId: windowRect.windowId },
    edge,
    id: overlayId(`drop:window:${windowRect.windowId}:${edge}`),
    kind: 'window-edge' as const,
    rect: edgeRect(windowRect.rect, edge, edgeThickness(windowRect.rect, edge, options)),
    windowId: windowRect.windowId,
  }))

  return [
    {
      destination: { kind: 'window-center', windowId: windowRect.windowId },
      id: overlayId(`drop:window:${windowRect.windowId}:center`),
      kind: 'window-center',
      rect: centerRect(windowRect.rect, options),
      windowId: windowRect.windowId,
    },
    ...edgeZones,
  ]
}

function parentEdgeDropZoneRects(
  layout: WorkspaceLayout,
  nodeRectsById: Readonly<Record<string, LayoutRect>>,
  options: LayoutGeometryOptions,
): readonly DropZoneLayoutRect[] {
  const zones: DropZoneLayoutRect[] = []

  for (const node of Object.values(layout.nodesById)) {
    if (node.id === layout.rootNodeId) continue

    const rect = nodeRectsById[node.id]
    if (!rect) continue

    zones.push(...parentEdgeDropZoneRectsForNode(node.id, rect, options))
  }

  return zones
}

function parentEdgeDropZoneRectsForNode(
  nodeId: LayoutNodeId,
  rect: LayoutRect,
  options: LayoutGeometryOptions,
) {
  return dropEdges().map((edge) => ({
    destination: { edge, kind: 'parent-edge' as const, nodeId },
    edge,
    id: overlayId(`drop:parent:${nodeId}:${edge}`),
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

function edgeRect(rect: LayoutRect, edge: DropEdge, thickness: number): LayoutRect {
  if (edge === 'left') return { height: rect.height, width: thickness, x: rect.x, y: rect.y }
  if (edge === 'right') {
    return { height: rect.height, width: thickness, x: rect.x + rect.width - thickness, y: rect.y }
  }
  if (edge === 'top') return { height: thickness, width: rect.width, x: rect.x, y: rect.y }

  return { height: thickness, width: rect.width, x: rect.x, y: rect.y + rect.height - thickness }
}

function edgeThickness(rect: LayoutRect, edge: DropEdge, options: LayoutGeometryOptions) {
  const size = edgeAxis(edge) === 'horizontal' ? rect.width : rect.height
  const ratio = options.dropEdgeRatio ?? DEFAULT_DROP_EDGE_RATIO
  const minimum = options.minDropZonePx ?? DEFAULT_MIN_DROP_ZONE_PX

  return Math.min(size / 2, Math.max(minimum, size * ratio))
}

function dropEdges(): readonly DropEdge[] {
  return ['left', 'right', 'top', 'bottom']
}
