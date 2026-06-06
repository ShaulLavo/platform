import type { RequestCloseTab } from '@/features/editor/hooks/use-dirty-tab-close'

import { applyLayoutOperation } from '@/features/tiling-surface-manager/utils/layout-operations'
import type {
  LayoutOperation,
  WorkspaceLayout,
} from '@/features/tiling-surface-manager/utils/layout-types'
import type { WorkspaceLayoutStoreApi } from '@/features/tiling-surface-manager/utils/surface-state'
import {
  layoutSnapshot,
  logWorkbenchLayoutInfo,
  logWorkbenchLayoutWarn,
  operationSummary,
  visibleLayoutChanged,
} from '@/features/tiling-surface-manager/utils/layout-logging'
import { editorSurfaceSerializedState } from '@/features/workbench/utils/editor-surface-layout'

export type EditorSurfaceDispatchContext = {
  readonly commitLayout: (layout: WorkspaceLayout) => void
  readonly requestCloseTab: RequestCloseTab
  readonly store: WorkspaceLayoutStoreApi
}

export function dispatchEditorSurfaceOperation(
  operation: LayoutOperation,
  context: EditorSurfaceDispatchContext,
) {
  if (requestDirtyEditorClose(operation, context)) return

  dispatchSurfaceOperation(operation, context)
}

function requestDirtyEditorClose(
  operation: LayoutOperation,
  context: EditorSurfaceDispatchContext,
) {
  if (operation.type !== 'closeSurface') return false

  const surface = context.store.getState().layout.surfacesById[operation.surfaceId]
  if (!surface) return false

  const editorState = editorSurfaceSerializedState(surface)
  if (!editorState) return false

  context.requestCloseTab(editorState.editorTabId)
  return true
}

function dispatchSurfaceOperation(
  operation: LayoutOperation,
  context: EditorSurfaceDispatchContext,
) {
  const beforeLayout = context.store.getState().layout
  const before = layoutSnapshot(beforeLayout)
  const operationContext = operationSummary(operation)

  try {
    const layout = applyLayoutOperation(beforeLayout, operation)
    context.store.getState().replaceLayout(layout)
    context.commitLayout(layout)
    logWorkbenchLayoutInfo('layout.operation.dispatch', {
      activeSurfaceChanged: beforeLayout.activeSurfaceId !== layout.activeSurfaceId,
      activeWindowChanged: beforeLayout.activeWindowId !== layout.activeWindowId,
      before,
      changed: visibleLayoutChanged(beforeLayout, layout),
      dispatcher: 'editor-surface',
      operation: operationContext,
      outcome: 'ok',
      result: layoutSnapshot(layout),
      stateChanged: layout !== beforeLayout,
    })
  } catch (error) {
    logWorkbenchLayoutWarn('layout.operation.dispatch', {
      before,
      dispatcher: 'editor-surface',
      error,
      operation: operationContext,
      outcome: 'error',
    })
    throw error
  }
}
