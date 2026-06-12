import { findWindowIdContainingSurface } from '@workspace/tiling/utils/layout-normalize'
import {
  createChatSurface,
  createDiagnosticsSurface,
  createFileNavigatorSurface,
  createGitChangesSurface,
  createLogsSurface,
  createSearchResultsSurface,
  createTerminalSurface,
  DEFAULT_TERMINAL_SESSION_ID,
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

export type WorkbenchRailRecipeState = 'active-recipe' | 'recipe'

export type WorkbenchRailRecipeItem = {
  readonly recipe: WorkspaceRecipe
  readonly state: WorkbenchRailRecipeState
}

export type WorkbenchRailItem = WorkbenchRailRecipeItem | WorkbenchRailSurfaceItem

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
    createTerminalSurface({ sessionId: DEFAULT_TERMINAL_SESSION_ID }),
    createDiagnosticsSurface(),
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
  const windowId = findWindowIdContainingSurface(layout, item.surface.id)

  if (windowId) {
    const window = layout.windowsById[windowId]
    if (window?.mode === 'collapsed') return 'collapsed'

    return item.surface.id === layout.activeSurfaceId ? 'active' : 'visible'
  }
  if (item.surface.id === layout.activeSurfaceId) return 'active'
  if (layout.rail.backgroundSurfaceIds.includes(item.surface.id)) return 'background'
  if (layout.rail.runningSurfaceIds.includes(item.surface.id)) return 'running'
  if (layout.rail.visibleSingletonSurfaceIds.includes(item.surface.id)) return 'visible'

  return item.state
}

export function railItemOperation(
  layout: WorkspaceLayout,
  item: WorkbenchRailItem,
): LayoutOperation {
  if (isWorkbenchRailRecipeItem(item)) {
    return { recipeId: item.recipe.id, type: 'applyRecipe' }
  }
  if (!layout.surfacesById[item.surface.id]) {
    return {
      surface: item.surface,
      type: 'openSurface',
    }
  }

  const windowId = railSurfaceWindowId(layout, item.surface.id)
  if (windowId) {
    return {
      surfaceId: item.surface.id,
      type: 'closeSurface',
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

export function isWorkbenchRailSurfaceItem(
  item: WorkbenchRailItem,
): item is WorkbenchRailSurfaceItem {
  return 'kind' in item && item.kind === 'surface'
}
