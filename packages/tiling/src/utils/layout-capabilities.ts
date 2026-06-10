import type {
  SnapDestination,
  Surface,
  SurfaceId,
  SurfaceType,
  WindowId,
  WorkspaceLayout,
} from '@workspace/tiling/utils/layout-types'

const EDITOR_TAB_SURFACE_TYPES = [
  'diff',
  'file-editor',
  'placeholder',
] as const satisfies readonly SurfaceType[]

const BOTTOM_TAB_SURFACE_TYPES = [
  'diagnostics',
  'terminal',
] as const satisfies readonly SurfaceType[]

const TAB_COMPATIBILITY_GROUPS = [EDITOR_TAB_SURFACE_TYPES, BOTTOM_TAB_SURFACE_TYPES] as const

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
  const surface = layout.surfacesById[surfaceId]
  const targetWindow = layout.windowsById[targetWindowId]
  if (!surface) return false
  if (!targetWindow) return false

  return targetWindow.surfaceIds.every((targetSurfaceId) =>
    surfaceCanTabWithSurface(layout, surface, targetSurfaceId),
  )
}

export function windowCanTabIntoWindow(
  layout: WorkspaceLayout,
  sourceWindowId: WindowId,
  targetWindowId: WindowId,
) {
  if (sourceWindowId === targetWindowId) return false

  const sourceWindow = layout.windowsById[sourceWindowId]
  const targetWindow = layout.windowsById[targetWindowId]
  if (!sourceWindow) return false
  if (!targetWindow) return false

  return sourceWindow.surfaceIds.every((surfaceId) =>
    surfaceCanTabIntoWindow(layout, surfaceId, targetWindowId),
  )
}

function surfaceCanTabWithSurface(
  layout: WorkspaceLayout,
  source: Surface,
  targetSurfaceId: SurfaceId,
) {
  if (source.id === targetSurfaceId) return true

  const target = layout.surfacesById[targetSurfaceId]
  if (!target) return false
  if (source.ownerSurfaceId === target.id) return true
  if (target.ownerSurfaceId === source.id) return true

  return surfaceTypesCanTabTogether(source.type, target.type)
}

function surfaceTypesCanTabTogether(sourceType: SurfaceType, targetType: SurfaceType) {
  for (const group of TAB_COMPATIBILITY_GROUPS) {
    if (!surfaceTypeInGroup(group, sourceType)) continue

    return surfaceTypeInGroup(group, targetType)
  }

  return false
}

function surfaceTypeInGroup(group: readonly SurfaceType[], surfaceType: SurfaceType) {
  return group.includes(surfaceType)
}
