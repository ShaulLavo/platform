import type { RequestCloseTab } from '@/features/editor/hooks/use-dirty-tab-close'

import { applyLayoutOperation } from './layout-operations'
import type { LayoutOperation, WorkspaceLayout } from './layout-types'
import type { WorkspaceLayoutStoreApi } from './surface-state'
import {
  layoutSnapshot,
  logWorkbenchLayoutInfo,
  logWorkbenchLayoutWarn,
  operationSummary,
  visibleLayoutChanged,
} from './workbench-layout-logging'
import { editorSurfaceSerializedState } from './workbench-editor-surface-layout'

export type WorkbenchEditorSurfaceDispatchContext = {
  readonly commitLayout: (layout: WorkspaceLayout) => void
  readonly requestCloseTab: RequestCloseTab
  readonly store: WorkspaceLayoutStoreApi
}

export function dispatchWorkbenchEditorSurfaceOperation(
  operation: LayoutOperation,
  context: WorkbenchEditorSurfaceDispatchContext,
) {
  if (requestDirtyEditorClose(operation, context)) return

  dispatchSurfaceOperation(operation, context)
}

function requestDirtyEditorClose(
  operation: LayoutOperation,
  context: WorkbenchEditorSurfaceDispatchContext,
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
  context: WorkbenchEditorSurfaceDispatchContext,
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
