import { logWorkbenchLayoutWarn } from '@/features/tiling-surface-manager/engine/layout-logging'
import {
  editorSurfaceSerializedState,
  editorSurfaceTabRecords,
} from '@/features/workbench/utils/editor-surface-layout'
import type { Surface, SurfaceId, WorkspaceLayout } from '@workspace/tiling/utils/layout-types'

// Editor tab ids are persisted in the workspace cache, so a stale cache or a
// reset id counter can produce layouts where two surfaces share a tab id or a
// tab id resolves to nothing. Both break tab clicks silently — log loudly.
export function resolveEditorSurfaceIdForTabId(
  layout: WorkspaceLayout,
  tabId: string,
): SurfaceId | null {
  const matches = Object.values(layout.surfacesById).filter(
    (surface) => editorSurfaceSerializedState(surface)?.editorTabId === tabId,
  )
  if (matches.length === 1) return matches[0]?.id ?? null
  if (matches.length === 0) {
    logWorkbenchLayoutWarn('layout.editor-tab.resolve', {
      knownTabs: editorSurfaceTabRecords(layout),
      outcome: 'unresolved',
      tabId,
    })

    return null
  }

  logWorkbenchLayoutWarn('layout.editor-tab.resolve', {
    matches: matches.map(surfaceSummary),
    outcome: 'duplicate-tab-id',
    tabId,
  })

  return matches[0]?.id ?? null
}

function surfaceSummary(surface: Surface) {
  return {
    id: surface.id,
    path: surface.resourceKey ?? null,
    title: surface.title,
  }
}
