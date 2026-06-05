import { findWindowIdContainingSurface } from './layout-normalize'
import type { Surface, SurfaceId, WorkspaceLayout } from './layout-types'

export type WorkbenchRailSurfaceState = 'active' | 'minimized' | 'pinned' | 'running' | 'visible'

export type WorkbenchRailSurfaceItem = {
  readonly state: WorkbenchRailSurfaceState
  readonly surface: Surface
}

export function selectWorkbenchRailSurfaceItems(
  layout: WorkspaceLayout,
): readonly WorkbenchRailSurfaceItem[] {
  const items: WorkbenchRailSurfaceItem[] = []
  const seen = new Set<SurfaceId>()

  appendRailItems(items, seen, layout, layout.rail.pinnedSurfaceIds, 'pinned')
  appendRailItems(items, seen, layout, layout.rail.visibleSingletonSurfaceIds, 'visible')
  appendRailItems(items, seen, layout, layout.rail.minimizedSurfaceIds, 'minimized')
  appendRailItems(items, seen, layout, layout.rail.runningSurfaceIds, 'running')

  return items.map((item) => railItemWithCurrentState(layout, item))
}

export function railSurfaceWindowId(layout: WorkspaceLayout, surfaceId: SurfaceId) {
  return findWindowIdContainingSurface(layout, surfaceId)
}

function appendRailItems(
  items: WorkbenchRailSurfaceItem[],
  seen: Set<SurfaceId>,
  layout: WorkspaceLayout,
  surfaceIds: readonly SurfaceId[],
  state: WorkbenchRailSurfaceState,
) {
  for (const surfaceId of surfaceIds) {
    if (seen.has(surfaceId)) continue

    const surface = layout.surfacesById[surfaceId]
    if (!surface) continue

    seen.add(surfaceId)
    items.push({ state, surface })
  }
}

function railItemWithCurrentState(
  layout: WorkspaceLayout,
  item: WorkbenchRailSurfaceItem,
): WorkbenchRailSurfaceItem {
  return {
    ...item,
    state: currentRailSurfaceState(layout, item),
  }
}

function currentRailSurfaceState(
  layout: WorkspaceLayout,
  item: WorkbenchRailSurfaceItem,
): WorkbenchRailSurfaceState {
  if (item.surface.id === layout.activeSurfaceId) return 'active'
  if (layout.rail.minimizedSurfaceIds.includes(item.surface.id)) return 'minimized'
  if (layout.rail.runningSurfaceIds.includes(item.surface.id)) return 'running'
  if (layout.rail.visibleSingletonSurfaceIds.includes(item.surface.id)) return 'visible'

  return item.state
}
