import {
  BOTTOM_PANE_RAIL_ID,
  bottomPaneRailOperation,
  bottomPaneSurfaces,
  bottomPaneWindowId,
  isBottomPaneSurface,
} from '@workspace/tiling/utils/bottom-pane-model'
import { findWindowIdContainingSurface } from '@workspace/tiling/utils/layout-normalize'
import {
  createChatSurface,
  createFileNavigatorSurface,
  createGitChangesSurface,
  createLogsSurface,
  createSearchResultsSurface,
} from '@workspace/tiling/utils/layout-builders'
import type {
  LayoutOperation,
  Surface,
  SurfaceId,
  WorkspaceRecipe,
  WorkspaceLayout,
} from '@workspace/tiling/utils/layout-types'

export type WorkbenchRailSurfaceState =
  | 'active'
  | 'background'
  | 'collapsed'
  | 'pinned'
  | 'running'
  | 'singleton'
  | 'visible'

export type WorkbenchRailSurfaceItem = {
  readonly kind: 'surface'
  readonly state: WorkbenchRailSurfaceState
  readonly surface: Surface
}

export type WorkbenchRailBottomPaneItem = {
  readonly id: typeof BOTTOM_PANE_RAIL_ID
  readonly kind: 'bottom-pane'
  readonly state: WorkbenchRailSurfaceState
  readonly title: 'Terminal'
}

export type WorkbenchRailRecipeState = 'active-recipe' | 'recipe'

export type WorkbenchRailRecipeItem = {
  readonly recipe: WorkspaceRecipe
  readonly state: WorkbenchRailRecipeState
}

export type WorkbenchRailItem =
  | WorkbenchRailBottomPaneItem
  | WorkbenchRailRecipeItem
  | WorkbenchRailSurfaceItem

export function selectWorkbenchRailItems(layout: WorkspaceLayout): readonly WorkbenchRailItem[] {
  return [...selectWorkbenchRailSurfaceItems(layout), bottomPaneRailItem(layout)]
}

export function selectWorkbenchRailSurfaceItems(
  layout: WorkspaceLayout,
): readonly WorkbenchRailSurfaceItem[] {
  const items: WorkbenchRailSurfaceItem[] = []
  const seen = new Set<SurfaceId>()

  appendDefaultRailItems(items, seen, layout)
  appendRailItems(items, seen, layout, layout.rail.pinnedSurfaceIds, 'pinned')
  appendRailItems(items, seen, layout, layout.rail.visibleSingletonSurfaceIds, 'visible')
  appendRailItems(items, seen, layout, layout.rail.backgroundSurfaceIds, 'background')
  appendRailItems(items, seen, layout, layout.rail.runningSurfaceIds, 'running')
  appendSingletonItems(items, seen, layout)

  return items.map((item) => railItemWithCurrentState(layout, item))
}

export function selectWorkbenchRailRecipeItems(
  layout: WorkspaceLayout,
): readonly WorkbenchRailRecipeItem[] {
  return layout.rail.recipeIds.flatMap((recipeId) => {
    const recipe = layout.recipesById[recipeId]
    if (!recipe) return []

    return [
      {
        recipe,
        state: recipeId === layout.activeRecipeId ? 'active-recipe' : 'recipe',
      },
    ]
  })
}

function appendDefaultRailItems(
  items: WorkbenchRailSurfaceItem[],
  seen: Set<SurfaceId>,
  layout: WorkspaceLayout,
) {
  const surfaces = [
    createFileNavigatorSurface(),
    createSearchResultsSurface(),
    createGitChangesSurface(),
    createChatSurface(),
    createLogsSurface(),
  ]

  for (const surface of surfaces) {
    appendRailItem(items, seen, layout.surfacesById[surface.id] ?? surface, 'pinned')
  }
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
  for (const surfaceId of surfaceIds ?? []) {
    if (seen.has(surfaceId)) continue

    const surface = layout.surfacesById[surfaceId]
    if (!surface) continue
    if (isBottomPaneSurface(surface)) continue

    appendRailItem(items, seen, surface, state)
  }
}

function appendSingletonItems(
  items: WorkbenchRailSurfaceItem[],
  seen: Set<SurfaceId>,
  layout: WorkspaceLayout,
) {
  for (const surface of Object.values(layout.surfacesById)) {
    if (surface.cardinality !== 'singleton') continue
    if (seen.has(surface.id)) continue
    if (isBottomPaneSurface(surface)) continue

    appendRailItem(items, seen, surface, 'singleton')
  }
}

function appendRailItem(
  items: WorkbenchRailSurfaceItem[],
  seen: Set<SurfaceId>,
  surface: Surface,
  state: WorkbenchRailSurfaceState,
) {
  if (seen.has(surface.id)) return

  seen.add(surface.id)
  items.push({ kind: 'surface', state, surface })
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
  if (findWindowIdContainingSurface(layout, item.surface.id)) {
    const windowId = findWindowIdContainingSurface(layout, item.surface.id)
    const window = windowId ? layout.windowsById[windowId] : null
    if (window?.mode === 'collapsed') return 'collapsed'

    return item.surface.id === layout.activeSurfaceId ? 'active' : 'visible'
  }
  if (item.surface.id === layout.activeSurfaceId) return 'active'
  if ((layout.rail.backgroundSurfaceIds ?? []).includes(item.surface.id)) return 'background'
  if ((layout.rail.runningSurfaceIds ?? []).includes(item.surface.id)) return 'running'
  if ((layout.rail.visibleSingletonSurfaceIds ?? []).includes(item.surface.id)) return 'visible'

  return item.state
}

export function railItemOperation(
  layout: WorkspaceLayout,
  item: WorkbenchRailItem,
): LayoutOperation {
  if (isWorkbenchRailRecipeItem(item)) {
    return { recipeId: item.recipe.id, type: 'applyRecipe' }
  }
  if (isWorkbenchRailBottomPaneItem(item)) return bottomPaneRailOperation(layout)

  if (!layout.surfacesById[item.surface.id]) {
    return {
      surface: item.surface,
      type: 'openSurface',
    }
  }

  const windowId = railSurfaceWindowId(layout, item.surface.id)
  const window = windowId ? layout.windowsById[windowId] : null
  if (windowId && window?.mode === 'collapsed') {
    return {
      type: 'expandWindow',
      windowId,
    }
  }

  if (windowId) {
    if (item.state === 'active' && item.surface.capabilities.canCollapse) {
      return {
        type: 'collapseWindow',
        windowId,
      }
    }

    return {
      surfaceId: item.surface.id,
      type: 'activateSurface',
      windowId,
    }
  }

  return {
    surfaceId: item.surface.id,
    type: 'restoreSurface',
  }
}

export function isWorkbenchRailRecipeItem(
  item: WorkbenchRailItem,
): item is WorkbenchRailRecipeItem {
  return 'recipe' in item
}

export function isWorkbenchRailBottomPaneItem(
  item: WorkbenchRailItem,
): item is WorkbenchRailBottomPaneItem {
  return 'kind' in item && item.kind === 'bottom-pane'
}

export function isWorkbenchRailSurfaceItem(
  item: WorkbenchRailItem,
): item is WorkbenchRailSurfaceItem {
  return 'kind' in item && item.kind === 'surface'
}

function bottomPaneRailItem(layout: WorkspaceLayout): WorkbenchRailBottomPaneItem {
  return {
    id: BOTTOM_PANE_RAIL_ID,
    kind: 'bottom-pane',
    state: bottomPaneRailState(layout),
    title: 'Terminal',
  }
}

function bottomPaneRailState(layout: WorkspaceLayout): WorkbenchRailSurfaceState {
  const windowId = bottomPaneWindowId(layout)
  const window = windowId ? layout.windowsById[windowId] : null
  if (window?.mode === 'collapsed') return 'collapsed'
  if (windowId) return windowId === layout.activeWindowId ? 'active' : 'visible'
  if (bottomPaneSurfaces(layout).length > 0) return 'running'

  return 'pinned'
}
