import { overlayId } from '@/features/tiling-surface-manager/engine/layout-ids'
import {
  edgeAxis,
  findNodeIdForWindow,
  repairSplitSizes,
  visibleWindowIdsInOrder,
} from '@/features/tiling-surface-manager/engine/layout-normalize'
import type {
  DropDestination,
  DropEdge,
  LayoutNode,
  LayoutNodeId,
  LayoutSplitAxis,
  OverlayId,
  WindowId,
  WorkspaceLayout,
} from '@/features/tiling-surface-manager/engine/layout-types'

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
  readonly kind:
    | 'background'
    | 'parent-edge'
    | 'recipe-slot'
    | 'root-edge'
    | 'window-center'
    | 'window-edge'
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
  readonly collapsedWindowHeaderPx?: number
  readonly dropEdgeRatio?: number
  readonly gapPx?: number
  readonly minDropZonePx?: number
  readonly resizeHandleThicknessPx?: number
}

const DEFAULT_COLLAPSED_WINDOW_HEADER_PX = 40
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

  assignNodeRect(
    layout,
    layout.rootNodeId,
    rootRect,
    nodeRectsById,
    options.gapPx ?? 0,
    options.collapsedWindowHeaderPx ?? DEFAULT_COLLAPSED_WINDOW_HEADER_PX,
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

export function deriveDropZoneRects(
  layout: WorkspaceLayout,
  rootRect: LayoutRect,
  nodeRectsById: Readonly<Record<string, LayoutRect>>,
  windowRectsById: Readonly<Record<string, WindowLayoutRect>>,
  options: LayoutGeometryOptions = {},
): readonly DropZoneLayoutRect[] {
  return [
    backgroundDropZoneRect(rootRect),
    ...recipeSlotDropZoneRects(rootRect),
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
  collapsedWindowHeaderPx: number,
) {
  const node = layout.nodesById[nodeId]
  if (!node) return

  nodeRectsById[nodeId] = rect
  if (node.kind === 'window') return

  const childRects = childRectsForSplit(layout, node, rect, gapPx, collapsedWindowHeaderPx)
  node.childIds.forEach((childId, index) => {
    const childRect = childRects[index]
    if (!childRect) return

    assignNodeRect(layout, childId, childRect, nodeRectsById, gapPx, collapsedWindowHeaderPx)
  })
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
  const mainSize = node.axis === 'horizontal' ? rect.width : rect.height
  const availableMainSize = Math.max(0, mainSize - gapPx * Math.max(0, node.childIds.length - 1))
  const fixedSizes = collapsedChildMainSizes(layout, node, collapsedWindowHeaderPx)
  const totalFixedSize = fixedSizes.reduce<number>((sum, size) => sum + (size ?? 0), 0)
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

function backgroundDropZoneRect(rootRect: LayoutRect): DropZoneLayoutRect {
  return {
    destination: { kind: 'background' },
    id: overlayId('drop:background'),
    kind: 'background',
    rect: insetLayoutRect(rootRect, Math.min(rootRect.width, rootRect.height) * 0.35),
  }
}

function recipeSlotDropZoneRects(rootRect: LayoutRect): readonly DropZoneLayoutRect[] {
  return [
    {
      destination: { kind: 'recipe-slot', slot: 'editor-center' },
      id: overlayId('drop:recipe-slot:editor-center'),
      kind: 'recipe-slot',
      rect: centerRect(rootRect, {}),
    },
    {
      destination: { kind: 'recipe-slot', slot: 'left-tool-pane' },
      id: overlayId('drop:recipe-slot:left-tool-pane'),
      kind: 'recipe-slot',
      rect: edgeRect(rootRect, 'left', Math.max(48, rootRect.width * 0.18)),
    },
    {
      destination: { kind: 'recipe-slot', slot: 'bottom' },
      id: overlayId('drop:recipe-slot:bottom'),
      kind: 'recipe-slot',
      rect: edgeRect(rootRect, 'bottom', Math.max(48, rootRect.height * 0.18)),
    },
  ]
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
