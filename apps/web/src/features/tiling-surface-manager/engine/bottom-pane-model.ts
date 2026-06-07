import {
  createDiagnosticsSurface,
  createTerminalSurface,
} from '@/features/tiling-surface-manager/engine/layout-builders'
import { visibleWindowIdsInOrder } from '@/features/tiling-surface-manager/engine/layout-normalize'
import type {
  LayoutOperation,
  Surface,
  SurfaceId,
  SurfaceType,
  WindowId,
  WorkbenchWindow,
  WorkspaceLayout,
} from '@/features/tiling-surface-manager/engine/layout-types'

export const BOTTOM_PANE_RAIL_ID = 'bottom-pane'
export const DEFAULT_BOTTOM_PANE_TERMINAL_SESSION_ID = 'terminal-1'

const BOTTOM_PANE_SURFACE_TYPES = ['terminal', 'diagnostics'] as const

export type BottomPaneSurfaceVisibilityItem = {
  readonly checked: boolean
  readonly disabled: boolean
  readonly exists: boolean
  readonly surface: Surface
}

export function bottomPaneWindowId(layout: WorkspaceLayout): WindowId | null {
  for (const windowId of visibleWindowIdsInOrder(layout)) {
    const window = layout.windowsById[windowId]
    if (!isBottomPaneWindow(layout, window)) continue

    return windowId
  }

  return null
}

export function isBottomPaneWindow(layout: WorkspaceLayout, window: WorkbenchWindow | undefined) {
  if (!window) return false

  return window.surfaceIds.some((surfaceId) => isBottomPaneSurface(layout.surfacesById[surfaceId]))
}

export function isBottomPaneSurface(surface: Surface | undefined): surface is Surface {
  if (!surface) return false

  return (BOTTOM_PANE_SURFACE_TYPES as readonly SurfaceType[]).includes(surface.type)
}

export function bottomPaneSurfaces(layout: WorkspaceLayout): readonly Surface[] {
  return Object.values(layout.surfacesById).filter(isBottomPaneSurface)
}

export function bottomPaneSurfaceVisibilityItems(
  layout: WorkspaceLayout,
  windowId: WindowId,
): readonly BottomPaneSurfaceVisibilityItem[] {
  const window = layout.windowsById[windowId]
  if (!isBottomPaneWindow(layout, window)) return []

  const visibleSurfaceIds = new Set(window.surfaceIds)
  const surfaces = bottomPaneMenuSurfaces(layout, window)
  const visibleCount = surfaces.filter((surface) => visibleSurfaceIds.has(surface.id)).length

  return surfaces.map((surface) => {
    const checked = visibleSurfaceIds.has(surface.id)

    return {
      checked,
      disabled: checked && visibleCount <= 1,
      exists: Boolean(layout.surfacesById[surface.id]),
      surface,
    }
  })
}

export function bottomPaneSurfaceVisibilityOperation(
  item: BottomPaneSurfaceVisibilityItem,
  nextChecked: boolean,
): LayoutOperation | null {
  if (nextChecked) return bottomPaneShowSurfaceOperation(item)
  if (item.disabled) return null
  if (!item.exists) return null

  return {
    destination: { kind: 'background' },
    surfaceId: item.surface.id,
    type: 'moveSurface',
  }
}

export function bottomPaneRailOperation(layout: WorkspaceLayout): LayoutOperation {
  const windowId = bottomPaneWindowId(layout)
  if (windowId) return bottomPaneCloseWindowOperation(windowId)

  return bottomPaneRestoreTerminalOperation(layout)
}

export function bottomPaneCloseWindowOperation(windowId: WindowId): LayoutOperation {
  return {
    destination: { kind: 'background' },
    type: 'moveWindow',
    windowId,
  }
}

function bottomPaneShowSurfaceOperation(item: BottomPaneSurfaceVisibilityItem): LayoutOperation {
  if (!item.exists) {
    return {
      surface: item.surface,
      type: 'openSurface',
    }
  }

  return {
    placement: { kind: 'recipe-slot', slot: 'bottom' },
    surfaceId: item.surface.id,
    type: 'restoreSurface',
  }
}

function bottomPaneRestoreTerminalOperation(layout: WorkspaceLayout): LayoutOperation {
  const terminal = existingBottomPaneTerminal(layout)
  if (terminal) {
    return {
      placement: { kind: 'recipe-slot', slot: 'bottom' },
      surfaceId: terminal.id,
      type: 'restoreSurface',
    }
  }

  return {
    surface: createTerminalSurface({ sessionId: DEFAULT_BOTTOM_PANE_TERMINAL_SESSION_ID }),
    type: 'openSurface',
  }
}

function existingBottomPaneTerminal(layout: WorkspaceLayout) {
  return bottomPaneSurfaces(layout).find((surface) => surface.type === 'terminal') ?? null
}

function bottomPaneMenuSurfaces(layout: WorkspaceLayout, window: WorkbenchWindow) {
  const surfaces: Surface[] = []
  const seen = new Set<SurfaceId>()

  appendWindowBottomPaneSurfaces(surfaces, seen, layout, window)
  appendExistingBottomPaneSurfaces(surfaces, seen, layout)
  appendDefaultBottomPaneSurfaces(surfaces, seen)

  return surfaces
}

function appendWindowBottomPaneSurfaces(
  surfaces: Surface[],
  seen: Set<SurfaceId>,
  layout: WorkspaceLayout,
  window: WorkbenchWindow,
) {
  for (const surfaceId of window.surfaceIds) {
    const surface = layout.surfacesById[surfaceId]
    if (!isBottomPaneSurface(surface)) continue

    appendBottomPaneSurface(surfaces, seen, surface)
  }
}

function appendExistingBottomPaneSurfaces(
  surfaces: Surface[],
  seen: Set<SurfaceId>,
  layout: WorkspaceLayout,
) {
  for (const surface of bottomPaneSurfaces(layout)) {
    appendBottomPaneSurface(surfaces, seen, surface)
  }
}

function appendDefaultBottomPaneSurfaces(surfaces: Surface[], seen: Set<SurfaceId>) {
  for (const surface of defaultBottomPaneSurfaces()) {
    appendBottomPaneSurface(surfaces, seen, surface)
  }
}

function defaultBottomPaneSurfaces() {
  return [
    createTerminalSurface({ sessionId: DEFAULT_BOTTOM_PANE_TERMINAL_SESSION_ID }),
    createDiagnosticsSurface(),
  ]
}

function appendBottomPaneSurface(surfaces: Surface[], seen: Set<SurfaceId>, surface: Surface) {
  if (seen.has(surface.id)) return

  seen.add(surface.id)
  surfaces.push(surface)
}
