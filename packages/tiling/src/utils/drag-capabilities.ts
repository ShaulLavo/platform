import {
  targetBelongsToTabStrip,
  type TilingDragData,
  type TilingDropData,
} from '@workspace/tiling/utils/drag-data'
import {
  surfaceCanTabIntoWindow,
  surfaceCanUseDestination,
  windowCanTabIntoWindow,
} from '@workspace/tiling/utils/layout-capabilities'
import type {
  SnapDestination,
  WindowId,
  WorkspaceLayout,
} from '@workspace/tiling/utils/layout-types'

export function dragSourceCanUseDropTarget(
  layout: WorkspaceLayout,
  source: TilingDragData,
  target: TilingDropData,
) {
  if (target.kind === 'snap-destination') {
    return dragSourceCanUseDestination(layout, source, target.destination)
  }
  if (targetBelongsToTabStrip(target)) {
    return dragSourceCanTabIntoWindow(layout, source, target.windowId)
  }
  if (target.kind === 'window' && source.kind === 'tab') {
    return surfaceCanTabIntoWindow(layout, source.surfaceId, target.windowId)
  }

  return true
}

export function dragSourceCanUseDestination(
  layout: WorkspaceLayout,
  source: TilingDragData,
  destination: SnapDestination,
) {
  if (source.kind === 'tab') {
    return surfaceCanUseDestination(layout, source.surfaceId, destination)
  }

  return windowCanUseDestination(layout, source.windowId, destination)
}

function dragSourceCanTabIntoWindow(
  layout: WorkspaceLayout,
  source: TilingDragData,
  targetWindowId: WindowId,
) {
  if (source.kind === 'tab') {
    return surfaceCanTabIntoWindow(layout, source.surfaceId, targetWindowId)
  }

  return windowCanTabIntoWindow(layout, source.windowId, targetWindowId)
}

function windowCanUseDestination(
  layout: WorkspaceLayout,
  windowId: WindowId,
  destination: SnapDestination,
) {
  if (destination.kind === 'window-center') {
    return windowCanTabIntoWindow(layout, windowId, destination.windowId)
  }

  const window = layout.windowsById[windowId]
  if (!window) return false

  return window.surfaceIds.every((surfaceId) =>
    surfaceCanUseDestination(layout, surfaceId, destination),
  )
}
