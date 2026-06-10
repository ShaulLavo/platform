import type { WindowId, WorkspaceLayout } from '@workspace/tiling/utils/layout-types'

export function proofWindowTitle(layout: WorkspaceLayout, windowId: WindowId): string {
  const window = layout.windowsById[windowId]
  const activeSurface = window ? layout.surfacesById[window.activeSurfaceId] : null
  if (activeSurface) return activeSurface.title

  return String(windowId)
}
