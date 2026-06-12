import type { WindowId, WorkbenchWindow } from '@workspace/tiling/utils/layout-types'

export function fullSurfaceLayoutWindowId(
  windowsById: Readonly<Record<WindowId, WorkbenchWindow>>,
): WindowId | undefined {
  return Object.values(windowsById).find(windowUsesFullSurface)?.id
}

function windowUsesFullSurface(window: WorkbenchWindow) {
  if (window.mode === 'fullscreen') return true

  return window.mode === 'maximized'
}
