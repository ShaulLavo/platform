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
import { recipeSlotForSurface } from '@workspace/tiling/utils/layout-queries'
import type {
  SnapDestination,
  SurfaceId,
  WindowId,
  WorkspaceLayout,
  WorkspaceRecipeSlot,
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

export function recipeFallbackTargetForDragSource(
  layout: WorkspaceLayout,
  source: TilingDragData,
): TilingDropData | null {
  const slot = recipeSlotForDragSource(layout, source)
  if (!slot) return null

  const destination = { kind: 'recipe-slot', slot } as const
  if (!dragSourceCanUseDestination(layout, source, destination)) return null

  return { destination, kind: 'snap-destination' }
}

export function recipeSlotForDragSource(
  layout: WorkspaceLayout,
  source: TilingDragData,
): WorkspaceRecipeSlot | null {
  if (source.kind === 'tab') return recipeSlotForSurfaceId(layout, source.surfaceId)

  return recipeSlotForWindow(layout, source.windowId)
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

function recipeSlotForWindow(layout: WorkspaceLayout, windowId: WindowId) {
  const window = layout.windowsById[windowId]
  if (!window) return null

  let slot: WorkspaceRecipeSlot | null = null
  for (const surfaceId of window.surfaceIds) {
    const surfaceSlot = recipeSlotForSurfaceId(layout, surfaceId)
    if (!surfaceSlot) return null
    if (!slot) {
      slot = surfaceSlot
      continue
    }
    if (slot !== surfaceSlot) return null
  }

  return slot
}

function recipeSlotForSurfaceId(layout: WorkspaceLayout, surfaceId: SurfaceId) {
  const surface = layout.surfacesById[surfaceId]
  if (!surface) return null

  return recipeSlotForSurface(layout, surface)
}
