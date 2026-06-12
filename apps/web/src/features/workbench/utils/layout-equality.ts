import { arraysEqual } from '@/lib/arrays'
import type {
  LayoutNode,
  WindowId,
  WorkbenchWindow,
  WorkspaceLayout,
} from '@workspace/tiling/utils/layout-types'

export function surfaceAreaLayoutEqual(left: WorkspaceLayout, right: WorkspaceLayout) {
  if (left === right) return true
  if (!layoutTreeGeometryEqual(left, right)) return false

  return layoutWindowsGeometryEqual(left.windowsById, right.windowsById)
}

function layoutTreeGeometryEqual(left: WorkspaceLayout, right: WorkspaceLayout): boolean {
  return layoutNodeGeometryEqual(left, right, layoutRootNode(left), layoutRootNode(right))
}

function layoutRootNode(layout: WorkspaceLayout) {
  if (!layout.rootNodeId) return undefined

  return layout.nodesById[layout.rootNodeId]
}

function layoutNodeGeometryEqual(
  leftLayout: WorkspaceLayout,
  rightLayout: WorkspaceLayout,
  leftNode: LayoutNode | undefined,
  rightNode: LayoutNode | undefined,
): boolean {
  if (leftNode === rightNode) return true
  if (!leftNode || !rightNode) return false
  if (leftNode.kind !== rightNode.kind) return false
  if (leftNode.kind === 'window') {
    return rightNode.kind === 'window' && leftNode.windowId === rightNode.windowId
  }
  if (rightNode.kind !== 'split') return false
  if (leftNode.axis !== rightNode.axis) return false
  if (!arraysEqual(leftNode.sizes, rightNode.sizes)) return false

  return layoutNodeChildrenGeometryEqual(leftLayout, rightLayout, leftNode, rightNode)
}

function layoutNodeChildrenGeometryEqual(
  leftLayout: WorkspaceLayout,
  rightLayout: WorkspaceLayout,
  leftNode: Extract<LayoutNode, { kind: 'split' }>,
  rightNode: Extract<LayoutNode, { kind: 'split' }>,
): boolean {
  if (leftNode.childIds.length !== rightNode.childIds.length) return false

  return leftNode.childIds.every((leftChildId, index) => {
    const rightChildId = rightNode.childIds[index]
    if (!rightChildId) return false

    return layoutNodeGeometryEqual(
      leftLayout,
      rightLayout,
      leftLayout.nodesById[leftChildId],
      rightLayout.nodesById[rightChildId],
    )
  })
}

function layoutWindowsGeometryEqual(
  left: Readonly<Record<WindowId, WorkbenchWindow>>,
  right: Readonly<Record<WindowId, WorkbenchWindow>>,
) {
  const leftWindowIds = Object.keys(left)
  const rightWindowIds = Object.keys(right)
  if (leftWindowIds.length !== rightWindowIds.length) return false

  return leftWindowIds.every((windowId) =>
    layoutWindowGeometryEqual(left[windowId as WindowId], right[windowId as WindowId]),
  )
}

function layoutWindowGeometryEqual(
  left: WorkbenchWindow | undefined,
  right: WorkbenchWindow | undefined,
) {
  if (left === right) return true
  if (!left || !right) return false
  if (left.collapsedEdge !== right.collapsedEdge) return false

  return left.mode === right.mode
}
