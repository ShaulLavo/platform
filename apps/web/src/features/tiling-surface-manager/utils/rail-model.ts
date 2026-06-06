import {
  findNodeIdForWindow,
  findWindowIdContainingSurface,
} from '@/features/tiling-surface-manager/utils/layout-normalize'
import {
  terminalSurfaceId,
  workbenchWindowId,
} from '@/features/tiling-surface-manager/utils/layout-ids'
import {
  createChatSurface,
  createFileNavigatorSurface,
  createGitChangesSurface,
  createLogsSurface,
  createSearchResultsSurface,
  createTerminalSurface,
} from '@/features/tiling-surface-manager/utils/layout-builders'
import type {
  LayoutOperation,
  Surface,
  SurfaceId,
  WorkspaceLayout,
} from '@/features/tiling-surface-manager/utils/layout-types'

const CLASSIC_BOTTOM_TOOL_PANE_WINDOW_ID = workbenchWindowId('classic:diagnostics')
const DEFAULT_TERMINAL_SURFACE_ID = terminalSurfaceId('terminal-1')

export type WorkbenchRailSurfaceState =
  | 'active'
  | 'minimized'
  | 'pinned'
  | 'running'
  | 'singleton'
  | 'visible'

export type WorkbenchRailSurfaceItem = {
  readonly state: WorkbenchRailSurfaceState
  readonly surface: Surface
}

export function selectWorkbenchRailSurfaceItems(
  layout: WorkspaceLayout,
): readonly WorkbenchRailSurfaceItem[] {
  const items: WorkbenchRailSurfaceItem[] = []
  const seen = new Set<SurfaceId>()

  appendDefaultRailItems(items, seen, layout)
  appendRailItems(items, seen, layout, layout.rail.pinnedSurfaceIds, 'pinned')
  appendRailItems(items, seen, layout, layout.rail.visibleSingletonSurfaceIds, 'visible')
  appendRailItems(items, seen, layout, layout.rail.minimizedSurfaceIds, 'minimized')
  appendRailItems(items, seen, layout, layout.rail.runningSurfaceIds, 'running')
  appendSingletonItems(items, seen, layout)

  return items.map((item) => railItemWithCurrentState(layout, item))
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
  for (const surfaceId of surfaceIds) {
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
  if (item.surface.id === DEFAULT_TERMINAL_SURFACE_ID) {
    return currentClassicBottomToolPaneState(layout)
  }

  if (findWindowIdContainingSurface(layout, item.surface.id)) {
    return item.surface.id === layout.activeSurfaceId ? 'active' : 'visible'
  }
  if (item.surface.id === layout.activeSurfaceId) return 'active'
  if (layout.rail.minimizedSurfaceIds.includes(item.surface.id)) return 'minimized'
  if (layout.rail.runningSurfaceIds.includes(item.surface.id)) return 'running'
  if (layout.rail.visibleSingletonSurfaceIds.includes(item.surface.id)) return 'visible'

  return item.state
}

function currentClassicBottomToolPaneState(layout: WorkspaceLayout): WorkbenchRailSurfaceState {
  const visible = Boolean(findNodeIdForWindow(layout, CLASSIC_BOTTOM_TOOL_PANE_WINDOW_ID))
  if (!visible)
    return layout.rail.runningSurfaceIds.includes(DEFAULT_TERMINAL_SURFACE_ID)
      ? 'running'
      : 'pinned'
  if (layout.activeSurfaceId !== DEFAULT_TERMINAL_SURFACE_ID) return 'visible'

  return 'active'
}

function classicBottomToolPaneOwnsDiagnostics(layout: WorkspaceLayout, surface: Surface) {
  if (surface.type !== 'diagnostics') return false

  return Boolean(
    layout.windowsById[CLASSIC_BOTTOM_TOOL_PANE_WINDOW_ID]?.surfaceIds.includes(surface.id),
  )
}

export function railItemOperation(
  layout: WorkspaceLayout,
  item: WorkbenchRailSurfaceItem,
): LayoutOperation {
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
  if (windowId && item.surface.capabilities.canMinimize) {
    return {
      surfaceId: item.surface.id,
      type: 'minimizeSurface',
    }
  }

  if (windowId) {
    return {
      surfaceId: item.surface.id,
      targetWindowId: windowId,
      type: 'tabSurface',
    }
  }

  return {
    surfaceId: item.surface.id,
    type: 'restoreSurface',
  }
}

function classicBottomToolPaneTargetForRailItem(item: WorkbenchRailSurfaceItem) {
  if (item.surface.id === DEFAULT_TERMINAL_SURFACE_ID) return 'terminal'

  return null
}
