import { findWindowIdContainingSurface } from '@/features/tiling-surface-manager/engine/layout-normalize'
import {
  classicBottomToolPaneOwnsSurface,
  DEFAULT_CLASSIC_TERMINAL_SURFACE_ID,
  visibleClassicBottomToolPaneWindowId,
} from '@/features/tiling-surface-manager/engine/bottom-tool-pane'
import {
  createChatSurface,
  createFileNavigatorSurface,
  createGitChangesSurface,
  createLogsSurface,
  createSearchResultsSurface,
  createTerminalSurface,
} from '@/features/tiling-surface-manager/engine/layout-builders'
import type {
  LayoutOperation,
  Surface,
  SurfaceId,
  WorkspaceRecipe,
  WorkspaceLayout,
} from '@/features/tiling-surface-manager/engine/layout-types'

export type WorkbenchRailSurfaceState =
  | 'active'
  | 'background'
  | 'collapsed'
  | 'pinned'
  | 'running'
  | 'singleton'
  | 'visible'

export type WorkbenchRailSurfaceItem = {
  readonly state: WorkbenchRailSurfaceState
  readonly surface: Surface
}

export type WorkbenchRailRecipeState = 'active-recipe' | 'recipe'

export type WorkbenchRailRecipeItem = {
  readonly recipe: WorkspaceRecipe
  readonly state: WorkbenchRailRecipeState
}

export type WorkbenchRailItem = WorkbenchRailRecipeItem | WorkbenchRailSurfaceItem

export function selectWorkbenchRailItems(layout: WorkspaceLayout): readonly WorkbenchRailItem[] {
  return [...selectWorkbenchRailSurfaceItems(layout), ...selectWorkbenchRailRecipeItems(layout)]
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
    createTerminalSurface({ sessionId: 'terminal-1' }),
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
    appendRailItem(items, seen, surface, state, layout)
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
    appendRailItem(items, seen, surface, 'singleton', layout)
  }
}

function appendRailItem(
  items: WorkbenchRailSurfaceItem[],
  seen: Set<SurfaceId>,
  surface: Surface,
  state: WorkbenchRailSurfaceState,
  layout?: WorkspaceLayout,
) {
  if (seen.has(surface.id)) return
  if (layout && classicBottomToolPaneOwnsDiagnostics(layout, surface)) return

  seen.add(surface.id)
  items.push({ state, surface })
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
  if (item.surface.id === DEFAULT_CLASSIC_TERMINAL_SURFACE_ID) {
    return currentClassicBottomToolPaneState(layout)
  }

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

function currentClassicBottomToolPaneState(layout: WorkspaceLayout): WorkbenchRailSurfaceState {
  const visibleWindowId = visibleClassicBottomToolPaneWindowId(layout)
  const visible = Boolean(visibleWindowId)
  if (!visible)
    return (layout.rail.runningSurfaceIds ?? []).includes(DEFAULT_CLASSIC_TERMINAL_SURFACE_ID)
      ? 'running'
      : 'pinned'
  if (layout.activeSurfaceId !== DEFAULT_CLASSIC_TERMINAL_SURFACE_ID) return 'visible'

  return 'active'
}

function classicBottomToolPaneOwnsDiagnostics(layout: WorkspaceLayout, surface: Surface) {
  if (surface.type !== 'diagnostics') return false

  return classicBottomToolPaneOwnsSurface(layout, surface.id)
}

export function railItemOperation(
  layout: WorkspaceLayout,
  item: WorkbenchRailItem,
): LayoutOperation {
  if (isWorkbenchRailRecipeItem(item)) {
    return { recipeId: item.recipe.id, type: 'applyRecipe' }
  }

  const classicBottomTarget = classicBottomToolPaneTargetForRailItem(item)
  if (classicBottomTarget) {
    return {
      target: classicBottomTarget,
      type: 'toggleClassicBottomToolPane',
    }
  }

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

function classicBottomToolPaneTargetForRailItem(item: WorkbenchRailSurfaceItem) {
  if (item.surface.id === DEFAULT_CLASSIC_TERMINAL_SURFACE_ID) return 'terminal'

  return null
}
