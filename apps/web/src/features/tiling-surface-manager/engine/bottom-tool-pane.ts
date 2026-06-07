import { terminalSurfaceId } from '@/features/tiling-surface-manager/engine/layout-ids'
import { findNodeIdForWindow } from '@/features/tiling-surface-manager/engine/layout-normalize'
import type {
  Surface,
  SurfaceId,
  WindowId,
  WorkbenchWindow,
  WorkspaceLayout,
} from '@/features/tiling-surface-manager/engine/layout-types'

export const DEFAULT_CLASSIC_TERMINAL_SURFACE_ID = terminalSurfaceId('terminal-1')

export function isClassicBottomToolPaneWindow(layout: WorkspaceLayout, window: WorkbenchWindow) {
  const surfaces = surfacesForWindow(layout, window)
  if (surfaces.length === 0) return false
  if (!surfaces.some((surface) => surface.type === 'diagnostics')) return false

  return surfaces.every((surface) => isClassicBottomToolPaneSurface(surface))
}

export function classicBottomToolPaneWindowId(layout: WorkspaceLayout): WindowId | null {
  for (const window of Object.values(layout.windowsById)) {
    if (!isClassicBottomToolPaneWindow(layout, window)) continue

    return window.id
  }

  return null
}

export function visibleClassicBottomToolPaneWindowId(layout: WorkspaceLayout): WindowId | null {
  const windowId = classicBottomToolPaneWindowId(layout)
  if (!windowId) return null
  if (!findNodeIdForWindow(layout, windowId)) return null

  return windowId
}

export function classicBottomToolPaneOwnsSurface(layout: WorkspaceLayout, surfaceId: SurfaceId) {
  const windowId = classicBottomToolPaneWindowId(layout)
  if (!windowId) return false

  return layout.windowsById[windowId]?.surfaceIds.includes(surfaceId) ?? false
}

function surfacesForWindow(layout: WorkspaceLayout, window: WorkbenchWindow) {
  return window.surfaceIds.map((surfaceId) => layout.surfacesById[surfaceId]).filter(isSurface)
}

function isClassicBottomToolPaneSurface(surface: Surface) {
  return surface.type === 'diagnostics' || surface.type === 'terminal'
}

function isSurface(surface: Surface | undefined): surface is Surface {
  return Boolean(surface)
}
