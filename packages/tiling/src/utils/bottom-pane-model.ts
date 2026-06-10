import {
  createDiagnosticsSurface,
  createTerminalSurface,
} from '@workspace/tiling/utils/layout-builders'
import {
  findWindowIdContainingSurface,
  visibleWindowIdsInOrder,
} from '@workspace/tiling/utils/layout-normalize'
import { stickyPlacementForSurface } from '@workspace/tiling/utils/layout-queries'
import { placementCanRestoreSurface } from '@workspace/tiling/utils/recipe-packing'
import type {
  LayoutOperation,
  Surface,
  SurfacePlacementHint,
  SurfaceId,
  SurfaceType,
  WindowId,
  WorkbenchWindow,
  WorkspaceLayout,
} from '@workspace/tiling/utils/layout-types'

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
  const terminalWindowId = visibleBottomPaneTerminalWindowId(layout)
  if (terminalWindowId) return terminalWindowId

  return firstVisibleBottomPaneWindowId(layout)
}

function firstVisibleBottomPaneWindowId(layout: WorkspaceLayout): WindowId | null {
  for (const windowId of visibleWindowIdsInOrder(layout)) {
    const window = layout.windowsById[windowId]
    if (!isBottomPaneWindow(layout, window)) continue

    return windowId
  }

  return null
}

export function isBottomPaneWindow(layout: WorkspaceLayout, window: WorkbenchWindow | undefined) {
  if (!window) return false
  if (window.surfaceIds.length === 0) return false

  return window.surfaceIds.every((surfaceId) => isBottomPaneSurface(layout.surfacesById[surfaceId]))
}

export function isBottomPaneSurface(surface: Surface | undefined): surface is Surface {
  if (!surface) return false

  return (BOTTOM_PANE_SURFACE_TYPES as readonly SurfaceType[]).includes(surface.type)
}

export function bottomPaneSurfaces(layout: WorkspaceLayout): readonly Surface[] {
  return Object.values(layout.surfacesById).filter(isBottomPaneSurface)
}

export function bottomPaneTerminalSurface(layout: WorkspaceLayout): Surface | null {
  return existingBottomPaneTerminal(layout)
}

export function bottomPaneTerminalWindowId(layout: WorkspaceLayout): WindowId | null {
  return visibleBottomPaneTerminalWindowId(layout)
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
  const terminal = existingBottomPaneTerminal(layout)
  if (terminal) {
    const terminalWindowId = findWindowIdContainingSurface(layout, terminal.id)
    if (terminalWindowId) {
      const terminalWindow = layout.windowsById[terminalWindowId]
      if (isBottomPaneWindow(layout, terminalWindow)) {
        return bottomPaneCloseWindowOperation(terminalWindowId)
      }

      return bottomPaneHideSurfaceOperation(terminal.id)
    }
  }

  const windowId = firstVisibleBottomPaneWindowId(layout)
  if (windowId) return bottomPaneCloseWindowOperation(windowId)
  if (terminal) return bottomPaneRestoreOperation(layout, terminal)

  return bottomPaneOpenTerminalOperation()
}

export function bottomPaneCloseWindowOperation(windowId: WindowId): LayoutOperation {
  return {
    destination: { kind: 'background' },
    type: 'moveWindow',
    windowId,
  }
}

function bottomPaneHideSurfaceOperation(surfaceId: SurfaceId): LayoutOperation {
  return {
    destination: { kind: 'background' },
    surfaceId,
    type: 'moveSurface',
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

function bottomPaneOpenTerminalOperation(): LayoutOperation {
  return {
    surface: createTerminalSurface({ sessionId: DEFAULT_BOTTOM_PANE_TERMINAL_SESSION_ID }),
    type: 'openSurface',
  }
}

function bottomPaneRestoreOperation(layout: WorkspaceLayout, terminal: Surface): LayoutOperation {
  const surfaceIds = hiddenBottomPaneRestoreSurfaceIds(layout, terminal)
  const placement = terminalManualRestorePlacement(layout, terminal)
  if (surfaceIds.length <= 1) {
    return {
      placement,
      surfaceId: terminal.id,
      type: 'restoreSurface',
    }
  }

  return {
    activeSurfaceId: terminal.id,
    placementsBySurfaceId: placement ? { [terminal.id]: placement } : undefined,
    surfaceIds,
    type: 'restoreSurfaces',
  }
}

function hiddenBottomPaneRestoreSurfaceIds(
  layout: WorkspaceLayout,
  terminal: Surface,
): readonly SurfaceId[] {
  return bottomPaneRestoreSurfaces(layout, terminal)
    .filter((surface) => !findWindowIdContainingSurface(layout, surface.id))
    .map((surface) => surface.id)
}

function bottomPaneRestoreSurfaces(layout: WorkspaceLayout, terminal: Surface): readonly Surface[] {
  const surfaces = existingBottomPaneSurfacesInDefaultOrder(layout)
  if (terminalHasManualPlacement(layout, terminal)) {
    return [...surfaces.filter((surface) => surface.id !== terminal.id), terminal]
  }

  return surfaces
}

function existingBottomPaneSurfacesInDefaultOrder(layout: WorkspaceLayout): readonly Surface[] {
  const surfaces: Surface[] = []
  const seen = new Set<SurfaceId>()

  appendExistingDefaultBottomPaneSurfaces(surfaces, seen, layout)
  appendExistingBottomPaneSurfaces(surfaces, seen, layout)

  return surfaces
}

function appendExistingDefaultBottomPaneSurfaces(
  surfaces: Surface[],
  seen: Set<SurfaceId>,
  layout: WorkspaceLayout,
) {
  for (const defaultSurface of defaultBottomPaneSurfaces()) {
    const surface = layout.surfacesById[defaultSurface.id]
    if (!surface) continue

    appendBottomPaneSurface(surfaces, seen, surface)
  }
}

function terminalManualRestorePlacement(
  layout: WorkspaceLayout,
  terminal: Surface,
): SurfacePlacementHint | undefined {
  const placement = stickyPlacementForSurface(layout, terminal.id)
  if (!placement) return undefined
  if (bottomRecipeSlotPlacement(placement)) return undefined
  if (placementCanRestoreSurface(layout, placement, terminal)) return placement
  if (placement.kind === 'parent-edge') return { edge: placement.edge, kind: 'root-edge' }
  if (placement.kind === 'window-edge') return { edge: placement.edge, kind: 'root-edge' }
  if (placement.kind === 'window-center') return { edge: 'right', kind: 'root-edge' }

  return undefined
}

function terminalHasManualPlacement(layout: WorkspaceLayout, terminal: Surface) {
  return Boolean(terminalManualRestorePlacement(layout, terminal))
}

function bottomRecipeSlotPlacement(placement: SurfacePlacementHint) {
  if (placement.kind !== 'recipe-slot') return false

  return placement.slot === 'bottom'
}

function visibleBottomPaneTerminalWindowId(layout: WorkspaceLayout) {
  const terminal = existingBottomPaneTerminal(layout)
  if (!terminal) return null

  const windowId = findWindowIdContainingSurface(layout, terminal.id)
  const window = windowId ? layout.windowsById[windowId] : undefined
  if (!isBottomPaneWindow(layout, window)) return null

  return windowId
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
