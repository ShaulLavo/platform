import type {
  SnapDestination,
  SurfaceId,
  WindowId,
  WorkspaceLayout,
} from '@workspace/tiling/utils/layout-types'

export function surfaceCanUseDestination(
  layout: WorkspaceLayout,
  surfaceId: SurfaceId,
  destination: SnapDestination,
) {
  const surface = layout.surfacesById[surfaceId]
  if (!surface) return false
  if (!surface.capabilities.validPlacements.includes(destination.kind)) return false
  if (destination.kind !== 'window-center') return true

  return surfaceCanTabIntoWindow(layout, surfaceId, destination.windowId)
}

export function surfaceCanTabIntoWindow(
  layout: WorkspaceLayout,
  surfaceId: SurfaceId,
  targetWindowId: WindowId,
) {
  if (!layout.surfacesById[surfaceId]) return false

  return Boolean(layout.windowsById[targetWindowId])
}

export function windowCanTabIntoWindow(
  layout: WorkspaceLayout,
  sourceWindowId: WindowId,
  targetWindowId: WindowId,
) {
  if (sourceWindowId === targetWindowId) return false
  if (!layout.windowsById[sourceWindowId]) return false

  return Boolean(layout.windowsById[targetWindowId])
}
