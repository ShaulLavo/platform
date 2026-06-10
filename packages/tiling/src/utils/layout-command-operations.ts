import {
  BACKGROUND_ACTIVE_SURFACE_COMMAND_ID,
  COLLAPSE_ACTIVE_WINDOW_COMMAND_ID,
  CLOSE_ACTIVE_SURFACE_COMMAND_ID,
  EXPAND_ACTIVE_WINDOW_COMMAND_ID,
  FOCUS_ACTIVE_CHILD_COMMAND_ID,
  FOCUS_PARENT_SPLIT_COMMAND_ID,
  FOCUS_RAIL_COMMAND_ID,
  FOCUS_WINDOW_BOTTOM_COMMAND_ID,
  FOCUS_WINDOW_LEFT_COMMAND_ID,
  FOCUS_WINDOW_RIGHT_COMMAND_ID,
  FOCUS_WINDOW_TOP_COMMAND_ID,
  FULLSCREEN_ACTIVE_WINDOW_COMMAND_ID,
  MAXIMIZE_ACTIVE_WINDOW_COMMAND_ID,
  MOVE_ACTIVE_SURFACE_BOTTOM_COMMAND_ID,
  MOVE_ACTIVE_SURFACE_LEFT_COMMAND_ID,
  MOVE_ACTIVE_SURFACE_RIGHT_COMMAND_ID,
  MOVE_ACTIVE_SURFACE_TOP_COMMAND_ID,
  MOVE_ACTIVE_SURFACE_TO_BACKGROUND_COMMAND_ID,
  MOVE_ACTIVE_WINDOW_BOTTOM_COMMAND_ID,
  MOVE_ACTIVE_WINDOW_LEFT_COMMAND_ID,
  MOVE_ACTIVE_WINDOW_NEXT_DISPLAY_COMMAND_ID,
  MOVE_ACTIVE_WINDOW_PREVIOUS_DISPLAY_COMMAND_ID,
  MOVE_ACTIVE_WINDOW_RIGHT_COMMAND_ID,
  MOVE_ACTIVE_WINDOW_TOP_COMMAND_ID,
  NEXT_SURFACE_IN_WINDOW_COMMAND_ID,
  PREVIOUS_SURFACE_IN_WINDOW_COMMAND_ID,
  REORDER_ACTIVE_SURFACE_LEFT_COMMAND_ID,
  REORDER_ACTIVE_SURFACE_RIGHT_COMMAND_ID,
  RESIZE_ACTIVE_SPLIT_BOTTOM_COMMAND_ID,
  RESIZE_ACTIVE_SPLIT_LEFT_COMMAND_ID,
  RESIZE_ACTIVE_SPLIT_RIGHT_COMMAND_ID,
  RESIZE_ACTIVE_SPLIT_TOP_COMMAND_ID,
  RESTORE_ACTIVE_WINDOW_COMMAND_ID,
  RESTORE_PREVIOUS_SURFACE_COMMAND_ID,
  SPLIT_ACTIVE_WINDOW_BOTTOM_COMMAND_ID,
  SPLIT_ACTIVE_WINDOW_LEFT_COMMAND_ID,
  SPLIT_ACTIVE_WINDOW_RIGHT_COMMAND_ID,
  SPLIT_ACTIVE_WINDOW_TOP_COMMAND_ID,
  TAB_ACTIVE_SURFACE_LEFT_COMMAND_ID,
  TAB_ACTIVE_SURFACE_RIGHT_COMMAND_ID,
  TEAR_ACTIVE_SURFACE_RIGHT_COMMAND_ID,
  builtInWindowManagementCommands,
  customCommandForBuiltInFrameCommand,
} from '@workspace/tiling/utils/layout-command-catalog'
import {
  findNodeIdForWindow,
  findParentNodeId,
  visibleWindowIdsInOrder,
} from '@workspace/tiling/utils/layout-normalize'
import {
  selectMruFallback,
  selectWindowNeighborIds,
} from '@workspace/tiling/utils/layout-selectors'
import type {
  BuiltInWindowManagementCommand,
  LayoutEdge,
  LayoutNodeId,
  LayoutOperation,
  SurfaceId,
  WindowManagementCommandId,
  WorkspaceLayout,
} from '@workspace/tiling/utils/layout-types'

export function layoutOperationForBuiltInWindowManagementCommand(
  layout: WorkspaceLayout,
  command: BuiltInWindowManagementCommand,
): LayoutOperation | null {
  const commandId = command.id
  const frameCommand = customCommandForBuiltInFrameCommand(command)
  if (frameCommand) return { command: frameCommand, type: 'applyCustomWindowCommand' }
  if (commandId === FOCUS_RAIL_COMMAND_ID) return null

  const activeWindowId = layout.activeWindowId
  const activeSurfaceId = layout.activeSurfaceId
  if (commandId === CLOSE_ACTIVE_SURFACE_COMMAND_ID && activeSurfaceId) {
    return { surfaceId: activeSurfaceId, type: 'closeSurface' }
  }

  const splitEdge = splitWindowEdgesByCommandId[commandId]
  if (splitEdge && activeWindowId && activeSurfaceId) {
    return {
      edge: splitEdge,
      surfaceId: activeSurfaceId,
      type: 'splitWindow',
      windowId: activeWindowId,
    }
  }

  const moveEdge = moveWindowEdgesByCommandId[commandId]
  if (moveEdge && activeWindowId) {
    return {
      destination: { edge: moveEdge, kind: 'root-edge' },
      type: 'moveWindow',
      windowId: activeWindowId,
    }
  }

  const surfaceMoveEdge = moveSurfaceEdgesByCommandId[commandId]
  if (surfaceMoveEdge && activeSurfaceId) {
    return {
      destination: { edge: surfaceMoveEdge, kind: 'root-edge' },
      surfaceId: activeSurfaceId,
      type: 'moveSurface',
    }
  }

  const focusEdge = focusWindowEdgesByCommandId[commandId]
  if (focusEdge) return focusWindowOperation(layout, focusEdge)

  const resizeEdge = resizeSplitEdgesByCommandId[commandId]
  if (resizeEdge) return resizeActiveSplitOperation(layout, resizeEdge)

  const tabEdge = tabSurfaceEdgesByCommandId[commandId]
  if (tabEdge && activeSurfaceId) return tabActiveSurfaceOperation(layout, activeSurfaceId, tabEdge)

  if (backgroundSurfaceCommandIds.has(commandId) && activeSurfaceId) {
    return {
      destination: { kind: 'background' },
      surfaceId: activeSurfaceId,
      type: 'moveSurface',
    }
  }
  if (!activeWindowId) return null

  return activeWindowOperation(layout, commandId, activeWindowId)
}

export function layoutOperationForBuiltInWindowManagementCommandId(
  layout: WorkspaceLayout,
  commandId: WindowManagementCommandId,
): LayoutOperation | null {
  const command = builtInWindowCommandsById.get(commandId)
  if (!command) return null

  return layoutOperationForBuiltInWindowManagementCommand(layout, command)
}

function activeWindowOperation(
  layout: WorkspaceLayout,
  commandId: BuiltInWindowManagementCommand['id'],
  windowId: WorkspaceLayout['activeWindowId'],
): LayoutOperation | null {
  if (!windowId) return null
  if (commandId === FULLSCREEN_ACTIVE_WINDOW_COMMAND_ID)
    return { type: 'fullscreenWindow', windowId }
  if (commandId === MAXIMIZE_ACTIVE_WINDOW_COMMAND_ID) return { type: 'maximizeWindow', windowId }
  if (commandId === RESTORE_ACTIVE_WINDOW_COMMAND_ID) return { type: 'restoreWindow', windowId }
  if (commandId === COLLAPSE_ACTIVE_WINDOW_COMMAND_ID) return { type: 'collapseWindow', windowId }
  if (commandId === EXPAND_ACTIVE_WINDOW_COMMAND_ID) return { type: 'expandWindow', windowId }
  if (commandId === NEXT_SURFACE_IN_WINDOW_COMMAND_ID)
    return nextSurfaceInWindowOperation(layout, 1)
  if (commandId === PREVIOUS_SURFACE_IN_WINDOW_COMMAND_ID) {
    return nextSurfaceInWindowOperation(layout, -1)
  }
  if (commandId === REORDER_ACTIVE_SURFACE_LEFT_COMMAND_ID) {
    return reorderActiveSurfaceOperation(layout, -1)
  }
  if (commandId === REORDER_ACTIVE_SURFACE_RIGHT_COMMAND_ID) {
    return reorderActiveSurfaceOperation(layout, 1)
  }
  if (commandId === TEAR_ACTIVE_SURFACE_RIGHT_COMMAND_ID) return tearActiveSurfaceOperation(layout)
  if (commandId === RESTORE_PREVIOUS_SURFACE_COMMAND_ID)
    return restorePreviousSurfaceOperation(layout)
  if (commandId === FOCUS_PARENT_SPLIT_COMMAND_ID) return focusParentSplitOperation(layout)
  if (commandId === FOCUS_ACTIVE_CHILD_COMMAND_ID) return focusActiveChildOperation(layout)
  if (displayMovementCommandIds.has(commandId)) return null

  return null
}

function focusWindowOperation(layout: WorkspaceLayout, edge: LayoutEdge): LayoutOperation | null {
  const activeWindowId = layout.activeWindowId
  if (!activeWindowId) return null

  const neighborId = selectWindowNeighborIds(layout, activeWindowId)[edge]
  if (!neighborId) return null

  const neighbor = layout.windowsById[neighborId]
  if (!neighbor) return null

  return {
    surfaceId: neighbor.activeSurfaceId,
    type: 'activateSurface',
    windowId: neighborId,
  }
}

function resizeActiveSplitOperation(
  layout: WorkspaceLayout,
  edge: LayoutEdge,
): LayoutOperation | null {
  const target = activeSplitResizeTarget(layout, edge)
  if (!target) return null

  return {
    deltaPx: target.deltaPx,
    handleIndex: target.handleIndex,
    splitId: target.splitId,
    type: 'resizeSplit',
  }
}

function activeSplitResizeTarget(layout: WorkspaceLayout, edge: LayoutEdge) {
  const activeWindowId = layout.activeWindowId
  if (!activeWindowId) return null

  const nodeId = findNodeIdForWindow(layout, activeWindowId)
  if (!nodeId) return null

  const parentNodeId = findParentNodeId(layout, nodeId)
  if (!parentNodeId) return null

  const parent = layout.nodesById[parentNodeId]
  if (!parent || parent.kind !== 'split') return null
  if (!resizeEdgeMatchesSplitAxis(edge, parent.axis)) return null

  const childIndex = parent.childIds.indexOf(nodeId)
  if (childIndex < 0) return null

  return resizeTargetForChildIndex(parentNodeId, childIndex, parent.childIds.length, edge)
}

function resizeTargetForChildIndex(
  splitId: LayoutNodeId,
  childIndex: number,
  childCount: number,
  edge: LayoutEdge,
) {
  const previousHandle = childIndex - 1
  if (edge === 'left' || edge === 'top') {
    if (previousHandle < 0) return null

    return { deltaPx: -80, handleIndex: previousHandle, splitId }
  }
  if (childIndex >= childCount - 1) return null

  return { deltaPx: 80, handleIndex: childIndex, splitId }
}

function resizeEdgeMatchesSplitAxis(edge: LayoutEdge, axis: 'horizontal' | 'vertical') {
  if (axis === 'horizontal') return edge === 'left' || edge === 'right'

  return edge === 'top' || edge === 'bottom'
}

function tabActiveSurfaceOperation(
  layout: WorkspaceLayout,
  surfaceId: SurfaceId,
  edge: LayoutEdge,
): LayoutOperation | null {
  const activeWindowId = layout.activeWindowId
  if (!activeWindowId) return null

  const targetWindowId = selectWindowNeighborIds(layout, activeWindowId)[edge]
  if (!targetWindowId) return null

  return { surfaceId, targetWindowId, type: 'tabSurface' }
}

function nextSurfaceInWindowOperation(
  layout: WorkspaceLayout,
  offset: number,
): LayoutOperation | null {
  const window = activeWindowForLayout(layout)
  if (!window) return null

  const activeIndex = window.surfaceIds.indexOf(window.activeSurfaceId)
  if (activeIndex < 0) return null

  const nextSurfaceId = wrappedItem(window.surfaceIds, activeIndex + offset)
  if (!nextSurfaceId) return null

  return {
    surfaceId: nextSurfaceId,
    type: 'activateSurface',
    windowId: window.id,
  }
}

function reorderActiveSurfaceOperation(
  layout: WorkspaceLayout,
  offset: number,
): LayoutOperation | null {
  const window = activeWindowForLayout(layout)
  if (!window) return null

  const fromIndex = window.surfaceIds.indexOf(window.activeSurfaceId)
  if (fromIndex < 0) return null

  const toIndex = fromIndex + offset
  if (toIndex < 0 || toIndex >= window.surfaceIds.length) return null

  return {
    fromIndex,
    toIndex,
    type: 'reorderSurface',
    windowId: window.id,
  }
}

function tearActiveSurfaceOperation(layout: WorkspaceLayout): LayoutOperation | null {
  const activeSurfaceId = layout.activeSurfaceId
  if (!activeSurfaceId) return null

  return {
    destination: { edge: 'right', kind: 'root-edge' },
    surfaceId: activeSurfaceId,
    type: 'moveSurface',
  }
}

function restorePreviousSurfaceOperation(layout: WorkspaceLayout): LayoutOperation | null {
  const fallback = selectMruFallback(layout).surface
  if (!fallback) return null

  return { surfaceId: fallback.id, type: 'restoreSurface' }
}

function focusParentSplitOperation(layout: WorkspaceLayout): LayoutOperation | null {
  const activeWindowId = layout.activeWindowId
  if (!activeWindowId) return null

  const windowIds = visibleWindowIdsInOrder(layout)
  const activeIndex = windowIds.indexOf(activeWindowId)
  if (activeIndex <= 0) return null

  const previousWindowId = windowIds[activeIndex - 1]
  return focusWindowByIdOperation(layout, previousWindowId)
}

function focusActiveChildOperation(layout: WorkspaceLayout): LayoutOperation | null {
  const activeWindowId = layout.activeWindowId
  if (!activeWindowId) return null

  return focusWindowByIdOperation(layout, activeWindowId)
}

function focusWindowByIdOperation(
  layout: WorkspaceLayout,
  windowId: WorkspaceLayout['activeWindowId'],
): LayoutOperation | null {
  if (!windowId) return null

  const window = layout.windowsById[windowId]
  if (!window) return null

  return {
    surfaceId: window.activeSurfaceId,
    type: 'activateSurface',
    windowId,
  }
}

function activeWindowForLayout(layout: WorkspaceLayout) {
  const activeWindowId = layout.activeWindowId
  if (!activeWindowId) return null

  return layout.windowsById[activeWindowId] ?? null
}

function wrappedItem<TItem>(items: readonly TItem[], index: number) {
  if (items.length === 0) return null

  const wrappedIndex = ((index % items.length) + items.length) % items.length
  return items[wrappedIndex] ?? null
}

const builtInWindowCommandsById = new Map(
  builtInWindowManagementCommands().map((command) => [command.id, command]),
)

const backgroundSurfaceCommandIds = new Set<BuiltInWindowManagementCommand['id']>([
  BACKGROUND_ACTIVE_SURFACE_COMMAND_ID,
  MOVE_ACTIVE_SURFACE_TO_BACKGROUND_COMMAND_ID,
])

const displayMovementCommandIds = new Set<BuiltInWindowManagementCommand['id']>([
  MOVE_ACTIVE_WINDOW_NEXT_DISPLAY_COMMAND_ID,
  MOVE_ACTIVE_WINDOW_PREVIOUS_DISPLAY_COMMAND_ID,
])

const splitWindowEdgesByCommandId: Readonly<Partial<Record<string, LayoutEdge>>> = {
  [SPLIT_ACTIVE_WINDOW_BOTTOM_COMMAND_ID]: 'bottom',
  [SPLIT_ACTIVE_WINDOW_LEFT_COMMAND_ID]: 'left',
  [SPLIT_ACTIVE_WINDOW_RIGHT_COMMAND_ID]: 'right',
  [SPLIT_ACTIVE_WINDOW_TOP_COMMAND_ID]: 'top',
}

const moveSurfaceEdgesByCommandId: Readonly<Partial<Record<string, LayoutEdge>>> = {
  [MOVE_ACTIVE_SURFACE_BOTTOM_COMMAND_ID]: 'bottom',
  [MOVE_ACTIVE_SURFACE_LEFT_COMMAND_ID]: 'left',
  [MOVE_ACTIVE_SURFACE_RIGHT_COMMAND_ID]: 'right',
  [MOVE_ACTIVE_SURFACE_TOP_COMMAND_ID]: 'top',
}

const moveWindowEdgesByCommandId: Readonly<Partial<Record<string, LayoutEdge>>> = {
  [MOVE_ACTIVE_WINDOW_BOTTOM_COMMAND_ID]: 'bottom',
  [MOVE_ACTIVE_WINDOW_LEFT_COMMAND_ID]: 'left',
  [MOVE_ACTIVE_WINDOW_RIGHT_COMMAND_ID]: 'right',
  [MOVE_ACTIVE_WINDOW_TOP_COMMAND_ID]: 'top',
}

const focusWindowEdgesByCommandId: Readonly<Partial<Record<string, LayoutEdge>>> = {
  [FOCUS_WINDOW_BOTTOM_COMMAND_ID]: 'bottom',
  [FOCUS_WINDOW_LEFT_COMMAND_ID]: 'left',
  [FOCUS_WINDOW_RIGHT_COMMAND_ID]: 'right',
  [FOCUS_WINDOW_TOP_COMMAND_ID]: 'top',
}

const resizeSplitEdgesByCommandId: Readonly<Partial<Record<string, LayoutEdge>>> = {
  [RESIZE_ACTIVE_SPLIT_BOTTOM_COMMAND_ID]: 'bottom',
  [RESIZE_ACTIVE_SPLIT_LEFT_COMMAND_ID]: 'left',
  [RESIZE_ACTIVE_SPLIT_RIGHT_COMMAND_ID]: 'right',
  [RESIZE_ACTIVE_SPLIT_TOP_COMMAND_ID]: 'top',
}

const tabSurfaceEdgesByCommandId: Readonly<Partial<Record<string, LayoutEdge>>> = {
  [TAB_ACTIVE_SURFACE_LEFT_COMMAND_ID]: 'left',
  [TAB_ACTIVE_SURFACE_RIGHT_COMMAND_ID]: 'right',
}
