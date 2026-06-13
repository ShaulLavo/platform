import { normalizeWorkspaceLayout } from '@workspace/tiling/utils/layout-normalize'
import type {
  CollapsedWindowRestore,
  LayoutEdge,
  WindowId,
  WorkbenchWindow,
  WorkspaceLayout,
} from '@workspace/tiling/utils/layout-types'

export function setWindowMode(
  layout: WorkspaceLayout,
  windowId: WindowId,
  mode: WorkbenchWindow['mode'],
): WorkspaceLayout {
  const normalizedLayout = normalizeWorkspaceLayout(layout)
  const window = normalizedLayout.windowsById[windowId]
  if (!window) return normalizedLayout

  return normalizeWorkspaceLayout(layoutWithWindowMode(normalizedLayout, windowId, mode))
}

export function layoutWithWindowMode(
  layout: WorkspaceLayout,
  windowId: WindowId,
  mode: WorkbenchWindow['mode'],
  collapsedEdge?: LayoutEdge,
  collapsedRestore?: CollapsedWindowRestore,
): WorkspaceLayout {
  const window = layout.windowsById[windowId]
  if (!window) return layout

  return {
    ...layout,
    windowsById: {
      ...layout.windowsById,
      [windowId]: windowWithMode(window, mode, collapsedEdge, collapsedRestore),
    },
  }
}

function windowWithMode(
  window: WorkbenchWindow,
  mode: WorkbenchWindow['mode'],
  collapsedEdge: LayoutEdge | undefined,
  collapsedRestore: CollapsedWindowRestore | undefined,
): WorkbenchWindow {
  if (mode === 'collapsed') {
    return {
      ...window,
      collapsedEdge,
      collapsedRestore,
      mode,
    }
  }

  return {
    activeSurfaceId: window.activeSurfaceId,
    id: window.id,
    mode,
    pinnedSurfaceIds: window.pinnedSurfaceIds,
    previewSurfaceId: window.previewSurfaceId,
    surfaceIds: window.surfaceIds,
  }
}
