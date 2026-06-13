import { selectCommandCycleStep } from '@workspace/tiling/utils/layout-command-cycling'
import {
  createChatSurface,
  createDiagnosticsSurface,
  createDiffSurface,
  createFileEditorSurface,
  createFileNavigatorSurface,
  createGitChangesSurface,
  createLogsSurface,
  createPlaceholderSurface,
  createSearchResultsDetailSurface,
  createSearchResultsSurface,
  createTerminalSurface,
} from '@workspace/tiling/utils/layout-builders'
import {
  edgeAxis,
  findNodeIdForWindow,
  findParentNodeId,
  findWindowIdContainingSurface,
  normalizeWorkspaceLayout,
  repairSplitSizes,
} from '@workspace/tiling/utils/layout-normalize'
import { moveWindow, openSurface } from '@workspace/tiling/utils/layout-operations'
import { RESIZE_REFERENCE_PX } from '@workspace/tiling/utils/resize'
import { layoutWithWindowMode, setWindowMode } from '@workspace/tiling/utils/window-modes'
import type {
  CustomWindowFrame,
  CustomWindowManagementCommand,
  LayoutCommandSurfaceSlot,
  LayoutEdge,
  LayoutSplitAxis,
  LayoutSplitNode,
  RecipeId,
  Surface,
  SurfacePlacementHint,
  WindowId,
  WindowManagementHotkeyPreset,
  WorkspaceLayout,
  WorkspaceLayoutCommand,
} from '@workspace/tiling/utils/layout-types'

export function fullscreenWindow(layout: WorkspaceLayout, windowId: WindowId): WorkspaceLayout {
  return setWindowMode(layout, windowId, 'fullscreen')
}

export function maximizeWindow(layout: WorkspaceLayout, windowId: WindowId): WorkspaceLayout {
  return setWindowMode(layout, windowId, 'maximized')
}

export function restoreWindow(layout: WorkspaceLayout, windowId: WindowId): WorkspaceLayout {
  return setWindowMode(layout, windowId, 'normal')
}

export function applyRecipe(layout: WorkspaceLayout, recipeId: RecipeId): WorkspaceLayout {
  const normalizedLayout = normalizeWorkspaceLayout(layout)
  const recipe = normalizedLayout.recipesById[recipeId]
  if (!recipe) return normalizedLayout

  const rootNodeId = recipe.resetRootNodeId
  const nextRootNodeId =
    rootNodeId && normalizedLayout.nodesById[rootNodeId] ? rootNodeId : normalizedLayout.rootNodeId

  return normalizeWorkspaceLayout({
    ...normalizedLayout,
    activeRecipeId: recipeId,
    rail: {
      ...normalizedLayout.rail,
      recipeIds: normalizedLayout.rail.recipeIds.includes(recipeId)
        ? normalizedLayout.rail.recipeIds
        : normalizedLayout.rail.recipeIds.concat(recipeId),
    },
    rootNodeId: nextRootNodeId,
  })
}

export function applyCustomWindowCommand(
  layout: WorkspaceLayout,
  command: CustomWindowManagementCommand,
  targetWindowId?: WindowId,
  nowMs = 0,
): WorkspaceLayout {
  const normalizedLayout = normalizeWorkspaceLayout(layout)
  if (!command.enabled) return normalizedLayout

  const windowId = targetWindowId ?? normalizedLayout.activeWindowId
  if (!windowId) return normalizedLayout
  if (!normalizedLayout.windowsById[windowId]) return normalizedLayout

  const selection = selectCommandCycleStep(normalizedLayout, {
    commandId: command.id,
    cycleRule: command.cycleRule,
    defaultFrame: command.targetFrame,
    nowMs,
    targetWindowId: windowId,
  })
  const layoutWithFrame = applyFrameToWindow(normalizedLayout, windowId, selection.frame)

  return normalizeWorkspaceLayout({
    ...layoutWithFrame,
    commandCycleState: selection.cycleState,
  })
}

export function applyLayoutCommand(
  layout: WorkspaceLayout,
  command: WorkspaceLayoutCommand,
): WorkspaceLayout {
  const normalizedLayout = normalizeWorkspaceLayout(layout)
  if (!command.enabled) return normalizedLayout

  let nextLayout = command.recipeId
    ? applyRecipe(normalizedLayout, command.recipeId)
    : normalizedLayout
  for (const slot of command.slots) {
    nextLayout = applyLayoutCommandSlot(nextLayout, slot)
  }

  return normalizeWorkspaceLayout(nextLayout)
}

export function upsertCustomWindowCommand(
  layout: WorkspaceLayout,
  command: CustomWindowManagementCommand,
): WorkspaceLayout {
  return normalizeWorkspaceLayout({
    ...layout,
    windowCommandsById: {
      ...layout.windowCommandsById,
      [command.id]: command,
    },
  })
}

export function upsertLayoutCommand(
  layout: WorkspaceLayout,
  command: WorkspaceLayoutCommand,
): WorkspaceLayout {
  return normalizeWorkspaceLayout({
    ...layout,
    layoutCommandsById: {
      ...layout.layoutCommandsById,
      [command.id]: command,
    },
  })
}

export function applyHotkeyPreset(
  layout: WorkspaceLayout,
  preset: WindowManagementHotkeyPreset,
): WorkspaceLayout {
  return normalizeWorkspaceLayout({
    ...layout,
    activeHotkeyPresetId: preset.id,
    hotkeyPresetsById: {
      ...layout.hotkeyPresetsById,
      [preset.id]: preset,
    },
  })
}

function applyLayoutCommandSlot(
  layout: WorkspaceLayout,
  slot: LayoutCommandSurfaceSlot,
): WorkspaceLayout {
  const surface = surfaceForLayoutCommandSlot(slot)
  if (!surface) return layout

  const openedLayout = openSurface(layout, {
    ...surface,
    placement: slot.displayHint ?? placementHintForFrame(layout, slot.frame),
  })
  const windowId = findWindowIdContainingSurface(openedLayout, surface.id)
  if (!windowId) return openedLayout

  return applyFrameToWindow(openedLayout, windowId, slot.frame)
}

function surfaceForLayoutCommandSlot(slot: LayoutCommandSurfaceSlot): Surface | null {
  if (slot.surfaceType === 'file-editor') return fileEditorSurfaceForSlot(slot)
  if (slot.surfaceType === 'diff') return diffSurfaceForSlot(slot)
  if (slot.surfaceType === 'search-results') return createSearchResultsSurface()
  if (slot.surfaceType === 'search-results-detail') return createSearchResultsDetailSurface()
  if (slot.surfaceType === 'terminal') return terminalSurfaceForSlot(slot)
  if (slot.surfaceType === 'file-navigator') return createFileNavigatorSurface()
  if (slot.surfaceType === 'git-changes') return createGitChangesSurface()
  if (slot.surfaceType === 'chat') return createChatSurface()
  if (slot.surfaceType === 'logs') return createLogsSurface()
  if (slot.surfaceType === 'diagnostics') return createDiagnosticsSurface()
  if (slot.surfaceType === 'placeholder') return placeholderSurfaceForSlot(slot)

  return null
}

function fileEditorSurfaceForSlot(slot: LayoutCommandSurfaceSlot): Surface | null {
  const path = slot.resourceKey ?? filePayloadValue(slot)
  if (!path) return null

  return createFileEditorSurface({ path })
}

function diffSurfaceForSlot(slot: LayoutCommandSurfaceSlot): Surface | null {
  if (!slot.resourceKey) return null

  return createDiffSurface({ diffDocumentId: slot.resourceKey })
}

function terminalSurfaceForSlot(slot: LayoutCommandSurfaceSlot): Surface {
  return createTerminalSurface({ sessionId: slot.stateKey ?? slot.resourceKey ?? slot.id })
}

function placeholderSurfaceForSlot(slot: LayoutCommandSurfaceSlot): Surface {
  return createPlaceholderSurface({
    contextKey: slot.stateKey ?? slot.resourceKey ?? slot.id,
    title: slot.resourceKey ?? slot.id,
  })
}

function filePayloadValue(slot: LayoutCommandSurfaceSlot) {
  if (slot.payload?.kind !== 'file') return null

  return slot.payload.value
}

function applyFrameToWindow(
  layout: WorkspaceLayout,
  windowId: WindowId,
  frame: CustomWindowFrame,
): WorkspaceLayout {
  if (frameMaximizes(frame)) return maximizeWindow(layout, windowId)

  const edge = edgeForFrameAnchor(frame.anchor)
  const layoutWithNormalMode = layoutWithWindowMode(layout, windowId, 'normal')
  if (!edge) return applyFrameCurrentSplitRatioToWindow(layoutWithNormalMode, windowId, frame)

  const movedLayout = moveWindow(layoutWithNormalMode, windowId, { edge, kind: 'root-edge' })
  return applyFrameMainRatioToWindow(movedLayout, windowId, frame, edge)
}

function placementHintForFrame(
  layout: WorkspaceLayout,
  frame: CustomWindowFrame,
): SurfacePlacementHint {
  const edge = edgeForFrameAnchor(frame.anchor)
  if (edge) return { edge, kind: 'root-edge' }
  if (layout.activeWindowId) return { kind: 'active-window' }

  return { edge: 'right', kind: 'root-edge' }
}

function edgeForFrameAnchor(anchor: CustomWindowFrame['anchor']): LayoutEdge | null {
  if (anchor.includes('left')) return 'left'
  if (anchor.includes('right')) return 'right'
  if (anchor.includes('top')) return 'top'
  if (anchor.includes('bottom')) return 'bottom'

  return null
}

function frameMaximizes(frame: CustomWindowFrame) {
  if (frame.unit !== 'percent') return false
  if (frame.anchor !== 'center') return false

  return frame.width >= 95 && frame.height >= 95
}

function applyFrameMainRatioToWindow(
  layout: WorkspaceLayout,
  windowId: WindowId,
  frame: CustomWindowFrame,
  edge: LayoutEdge,
): WorkspaceLayout {
  const ratio = mainAxisRatioForFrame(frame, edge)
  if (ratio === null) return layout

  const nodeId = findNodeIdForWindow(layout, windowId)
  if (!nodeId) return layout

  const parentNodeId = findParentNodeId(layout, nodeId)
  if (!parentNodeId) return layout

  const split = layout.nodesById[parentNodeId]
  if (!split || split.kind !== 'split') return layout
  if (split.axis !== edgeAxis(edge)) return layout

  const childIndex = split.childIds.indexOf(nodeId)
  if (childIndex < 0) return layout

  return layoutWithSplitChildRatio(layout, split, childIndex, ratio)
}

function applyFrameCurrentSplitRatioToWindow(
  layout: WorkspaceLayout,
  windowId: WindowId,
  frame: CustomWindowFrame,
): WorkspaceLayout {
  const nodeId = findNodeIdForWindow(layout, windowId)
  if (!nodeId) return layout

  const parentNodeId = findParentNodeId(layout, nodeId)
  if (!parentNodeId) return layout

  const split = layout.nodesById[parentNodeId]
  if (!split || split.kind !== 'split') return layout

  const childIndex = split.childIds.indexOf(nodeId)
  if (childIndex < 0) return layout

  const ratio = splitAxisRatioForFrame(frame, split.axis)
  if (ratio === null) return layout

  return layoutWithSplitChildRatio(layout, split, childIndex, ratio)
}

function mainAxisRatioForFrame(frame: CustomWindowFrame, edge: LayoutEdge) {
  return frameAxisRatio(frame, edgeAxis(edge))
}

function splitAxisRatioForFrame(frame: CustomWindowFrame, axis: LayoutSplitAxis) {
  return frameAxisRatio(frame, axis)
}

function frameAxisRatio(frame: CustomWindowFrame, axis: LayoutSplitAxis) {
  const size = frameAxisSize(frame, axis)
  if (frame.unit === 'percent') return clampFrameRatio(size / 100)

  return clampFrameRatio(size / RESIZE_REFERENCE_PX)
}

function frameAxisSize(frame: CustomWindowFrame, axis: LayoutSplitAxis) {
  const size = axis === 'horizontal' ? frame.width : frame.height
  const offset = axis === 'horizontal' ? frame.offsetX : frame.offsetY

  // TODO(frame-offset-policy): This legacy projection folds frame offset into
  // the target split because split ratios cannot encode free-space origin.
  // See docs/tiling-surface-manager/future-layout-plan.md.
  return size + Math.abs(offset)
}

function layoutWithSplitChildRatio(
  layout: WorkspaceLayout,
  split: LayoutSplitNode,
  childIndex: number,
  ratio: number,
): WorkspaceLayout {
  const sizes = splitSizesWithChildRatio(split, childIndex, ratio)

  return normalizeWorkspaceLayout({
    ...layout,
    nodesById: {
      ...layout.nodesById,
      [split.id]: {
        ...split,
        sizes,
      },
    },
  })
}

function splitSizesWithChildRatio(split: LayoutSplitNode, childIndex: number, ratio: number) {
  const sizes = repairSplitSizes(split.sizes, split.childIds.length)
  if (sizes.length <= 1) return sizes

  const remainingRatio = 1 - ratio
  const remainingTotal = sizes.reduce((sum, size, index) => {
    if (index === childIndex) return sum

    return sum + size
  }, 0)

  return repairSplitSizes(
    sizes.map((size, index) => {
      if (index === childIndex) return ratio
      if (remainingTotal <= 0) return remainingRatio / Math.max(1, sizes.length - 1)

      return (size / remainingTotal) * remainingRatio
    }),
    sizes.length,
  )
}

function clampFrameRatio(ratio: number) {
  if (!Number.isFinite(ratio)) return null

  return Math.min(0.9, Math.max(0.1, ratio))
}
