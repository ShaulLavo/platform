import { repairSplitSizes } from '@workspace/tiling/utils/layout-normalize'
import { recordUserPaneShares } from '@workspace/tiling/utils/recipe-packing'
import type {
  LayoutNodeId,
  LayoutSplitAxis,
  LayoutSplitNode,
  Surface,
  WindowId,
  WorkspaceLayout,
} from '@workspace/tiling/utils/layout-types'
import { normalizeWorkspaceLayout } from '@workspace/tiling/utils/layout-normalize'

export const RESIZE_REFERENCE_PX = 1000

const MIN_RESIZE_SIZE = 0.05
const MIN_EDITOR_RESIZE_SIZE = 0.22
const MIN_TERMINAL_RESIZE_SIZE = 0.16
const MIN_TOOL_RESIZE_SIZE = 0.14
const MIN_VERTICAL_TOOL_RESIZE_SIZE = 0.12

export function resizeSplit(
  layout: WorkspaceLayout,
  splitId: LayoutNodeId,
  handleIndex: number,
  deltaPx: number,
  referencePx: number = RESIZE_REFERENCE_PX,
): WorkspaceLayout {
  const normalizedLayout = normalizeWorkspaceLayout(layout)
  const split = normalizedLayout.nodesById[splitId]
  if (!split || split.kind !== 'split') return normalizedLayout
  if (handleIndex < 0 || handleIndex >= split.childIds.length - 1) return normalizedLayout

  const sizes = resizeAdjacentSizes(normalizedLayout, split, handleIndex, deltaPx, referencePx)
  const resizedLayout = {
    ...normalizedLayout,
    nodesById: {
      ...normalizedLayout.nodesById,
      [splitId]: {
        ...split,
        sizes,
      },
    },
  }

  return normalizeWorkspaceLayout(recordUserPaneShares(resizedLayout, splitId))
}

function resizeAdjacentSizes(
  layout: WorkspaceLayout,
  split: LayoutSplitNode,
  handleIndex: number,
  deltaPx: number,
  referencePx: number,
) {
  const sizes = split.sizes
  const repairedSizes = repairSplitSizes(sizes, sizes.length)
  const delta = resizeRatioDelta(deltaPx, referencePx)
  const left = repairedSizes[handleIndex] ?? 0
  const right = repairedSizes[handleIndex + 1] ?? 0
  const minimums = constrainedResizeMinimums(
    resizeMinimumForNode(layout, split.childIds[handleIndex], split.axis),
    resizeMinimumForNode(layout, split.childIds[handleIndex + 1], split.axis),
    left + right,
  )
  const clampedDelta = clampDelta(left, right, delta, minimums.left, minimums.right)
  const nextSizes = repairedSizes.slice()
  nextSizes[handleIndex] = left + clampedDelta
  nextSizes[handleIndex + 1] = right - clampedDelta

  return repairSplitSizes(nextSizes, nextSizes.length)
}

function resizeRatioDelta(deltaPx: number, referencePx: number) {
  if (!Number.isFinite(referencePx)) return deltaPx / RESIZE_REFERENCE_PX
  if (referencePx <= 0) return deltaPx / RESIZE_REFERENCE_PX

  return deltaPx / referencePx
}

function constrainedResizeMinimums(left: number, right: number, total: number) {
  const minimumTotal = left + right
  if (minimumTotal <= total) return { left, right }
  if (minimumTotal <= 0) return { left: MIN_RESIZE_SIZE, right: MIN_RESIZE_SIZE }

  const scale = total / minimumTotal
  return {
    left: left * scale,
    right: right * scale,
  }
}

function clampDelta(
  left: number,
  right: number,
  delta: number,
  minimumLeft: number,
  minimumRight: number,
) {
  const maxPositiveDelta = right - minimumRight
  const maxNegativeDelta = minimumLeft - left

  return Math.max(maxNegativeDelta, Math.min(maxPositiveDelta, delta))
}

function resizeMinimumForNode(
  layout: WorkspaceLayout,
  nodeId: LayoutNodeId | undefined,
  axis: LayoutSplitAxis,
): number {
  if (!nodeId) return MIN_RESIZE_SIZE

  const node = layout.nodesById[nodeId]
  if (!node) return MIN_RESIZE_SIZE
  if (node.kind === 'window') return resizeMinimumForWindow(layout, node.windowId, axis)

  const childMinimums: number[] = node.childIds.map((childId) =>
    resizeMinimumForNode(layout, childId, axis),
  )
  if (node.axis === axis) {
    return Math.max(
      MIN_RESIZE_SIZE,
      childMinimums.reduce<number>((sum, size) => sum + size, 0),
    )
  }

  return Math.max(MIN_RESIZE_SIZE, ...childMinimums)
}

function resizeMinimumForWindow(
  layout: WorkspaceLayout,
  windowId: WindowId,
  axis: LayoutSplitAxis,
): number {
  const window = layout.windowsById[windowId]
  if (!window) return MIN_RESIZE_SIZE
  if (window.mode === 'collapsed') return MIN_RESIZE_SIZE

  const minimums = window.surfaceIds.map((surfaceId) =>
    resizeMinimumForSurface(layout.surfacesById[surfaceId], axis),
  )

  return Math.max(MIN_RESIZE_SIZE, ...minimums)
}

function resizeMinimumForSurface(surface: Surface | undefined, axis: LayoutSplitAxis): number {
  if (!surface) return MIN_RESIZE_SIZE
  if (surface.type === 'file-editor') return MIN_EDITOR_RESIZE_SIZE
  if (surface.type === 'diff') return MIN_EDITOR_RESIZE_SIZE
  if (surface.type === 'placeholder') return MIN_EDITOR_RESIZE_SIZE
  if (surface.type === 'search-preview') return MIN_EDITOR_RESIZE_SIZE
  if (surface.type === 'terminal') return MIN_TERMINAL_RESIZE_SIZE
  if (surface.type === 'diagnostics') return MIN_VERTICAL_TOOL_RESIZE_SIZE
  if (axis === 'vertical') return MIN_VERTICAL_TOOL_RESIZE_SIZE

  return MIN_TOOL_RESIZE_SIZE
}
