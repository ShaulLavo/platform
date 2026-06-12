import { balancedSizes } from '@workspace/tiling/utils/geometry-primitives'
import { layoutNodeId } from '@workspace/tiling/utils/layout-ids'
import { deriveNodeRects, type LayoutRect } from '@workspace/tiling/utils/layout-geometry'
import {
  findNodeIdForWindow,
  normalizeWorkspaceLayout,
  visibleWindowIdsInOrder,
} from '@workspace/tiling/utils/layout-normalize'
import type { LayoutNode, WindowId, WorkspaceLayout } from '@workspace/tiling/utils/layout-types'

// Rows in a balanced grid land on exact split fractions, so this only has to
// absorb float noise, not real misalignment.
const READING_ORDER_EPSILON = 1e-3
const UNIT_RECT: LayoutRect = { height: 1, width: 1, x: 0, y: 0 }

export type WindowColumnSummary = {
  readonly columnCount: number
  readonly rightEdge: number
}

type WindowPosition = {
  readonly windowId: WindowId
  readonly x: number
  readonly y: number
}

export function balancedColumnCount(itemCount: number) {
  if (itemCount <= 0) return 0

  return Math.ceil(Math.sqrt(itemCount))
}

// "Items fill the shortest column in arrival order" with ties going to the
// leftmost column, which for ceil(sqrt(n)) columns is round-robin assignment.
export function partitionIntoBalancedColumns<TItem>(items: readonly TItem[]): TItem[][] {
  const columnCount = balancedColumnCount(items.length)
  const columns: TItem[][] = Array.from({ length: columnCount }, () => [])

  for (const [index, item] of items.entries()) {
    columns[index % columnCount]?.push(item)
  }

  return columns
}

// Recovers arrival order from a balanced grid: reading positions row by row
// inverts the round-robin packing, so repacking with an appended window keeps
// every existing window in its column.
export function windowIdsInReadingOrder(
  layout: WorkspaceLayout,
  windowIds: readonly WindowId[],
): WindowId[] {
  const positions = windowPositions(layout, windowIds)
  const sorted = positions.positioned.slice().sort(compareReadingPosition)

  return [...sorted.map((position) => position.windowId), ...positions.unpositioned]
}

export function windowColumnSummary(
  layout: WorkspaceLayout,
  windowIds: readonly WindowId[],
): WindowColumnSummary | null {
  const nodeRectsById = deriveNodeRects(layout, UNIT_RECT, { collapsedWindowHeaderPx: 0 })
  const rects = windowIds.flatMap((windowId) => {
    const nodeId = findNodeIdForWindow(layout, windowId)
    const rect = nodeId ? nodeRectsById[nodeId] : undefined

    return rect ? [rect] : []
  })
  if (rects.length === 0) return null

  return {
    columnCount: distinctColumnCount(rects),
    rightEdge: Math.max(...rects.map((rect) => rect.x + rect.width)),
  }
}

export function packLayoutIntoBalancedColumns(
  layout: WorkspaceLayout,
  orderedWindowIds?: readonly WindowId[],
): WorkspaceLayout {
  const normalizedLayout = normalizeWorkspaceLayout(layout)
  const visibleWindowIds = visibleWindowIdsInOrder(normalizedLayout)
  if (visibleWindowIds.length <= 1) return normalizedLayout

  const readingOrder = windowIdsInReadingOrder(normalizedLayout, visibleWindowIds)
  const order = orderedWindowIds ? mergeWindowOrder(orderedWindowIds, readingOrder) : readingOrder
  const tree = balancedColumnsTreeForWindows(normalizedLayout, order)
  if (!tree) return normalizedLayout

  return normalizeWorkspaceLayout({
    ...normalizedLayout,
    nodesById: tree.nodesById,
    rootNodeId: tree.rootNodeId,
  })
}

function mergeWindowOrder(
  orderedWindowIds: readonly WindowId[],
  readingOrder: readonly WindowId[],
): WindowId[] {
  const readingSet = new Set(readingOrder)
  const explicitOrder = orderedWindowIds.filter((windowId) => readingSet.has(windowId))
  const explicitSet = new Set(explicitOrder)

  return [...explicitOrder, ...readingOrder.filter((windowId) => !explicitSet.has(windowId))]
}

function balancedColumnsTreeForWindows(layout: WorkspaceLayout, windowIds: readonly WindowId[]) {
  const windowNodes = windowIds.flatMap((windowId) => {
    const nodeId = findNodeIdForWindow(layout, windowId)
    const node = nodeId ? layout.nodesById[nodeId] : undefined

    return node ? [node] : []
  })
  if (windowNodes.length !== windowIds.length) return null

  const columns = partitionIntoBalancedColumns(windowNodes)
  const nodesById: Record<string, LayoutNode> = {}
  const columnNodeIds = columns.map((columnNodes, index) =>
    columnNodeId(columnNodes, index, nodesById),
  )
  if (columnNodeIds.length === 1) {
    return { nodesById, rootNodeId: columnNodeIds[0] }
  }

  const rootNode = {
    axis: 'horizontal',
    childIds: columnNodeIds,
    id: layoutNodeId('balanced:columns'),
    kind: 'split',
    sizes: balancedSizes(columnNodeIds.length),
  } satisfies LayoutNode
  nodesById[rootNode.id] = rootNode

  return { nodesById, rootNodeId: rootNode.id }
}

function columnNodeId(
  columnNodes: readonly LayoutNode[],
  columnIndex: number,
  nodesById: Record<string, LayoutNode>,
) {
  for (const node of columnNodes) {
    nodesById[node.id] = node
  }
  if (columnNodes.length === 1) return columnNodes[0].id

  const columnNode = {
    axis: 'vertical',
    childIds: columnNodes.map((node) => node.id),
    id: layoutNodeId(`balanced:col:${columnIndex}`),
    kind: 'split',
    sizes: balancedSizes(columnNodes.length),
  } satisfies LayoutNode
  nodesById[columnNode.id] = columnNode

  return columnNode.id
}

function windowPositions(layout: WorkspaceLayout, windowIds: readonly WindowId[]) {
  const nodeRectsById = deriveNodeRects(layout, UNIT_RECT, { collapsedWindowHeaderPx: 0 })
  const positioned: WindowPosition[] = []
  const unpositioned: WindowId[] = []

  for (const windowId of windowIds) {
    const nodeId = findNodeIdForWindow(layout, windowId)
    const rect = nodeId ? nodeRectsById[nodeId] : undefined
    if (!rect) {
      unpositioned.push(windowId)
      continue
    }

    positioned.push({ windowId, x: rect.x, y: rect.y })
  }

  return { positioned, unpositioned }
}

function compareReadingPosition(a: WindowPosition, b: WindowPosition) {
  if (Math.abs(a.y - b.y) > READING_ORDER_EPSILON) return a.y - b.y

  return a.x - b.x
}

function distinctColumnCount(rects: readonly LayoutRect[]) {
  const columnLefts: number[] = []

  for (const rect of rects) {
    const isKnownColumn = columnLefts.some(
      (left) => Math.abs(left - rect.x) <= READING_ORDER_EPSILON,
    )
    if (isKnownColumn) continue

    columnLefts.push(rect.x)
  }

  return columnLefts.length
}
