import type { RequestCloseTab } from '@/features/editor/hooks/use-dirty-tab-close'

import { applyLayoutOperation } from './layout-operations'
import type { LayoutOperation, WorkspaceLayout } from './layout-types'
import type { WorkspaceLayoutStoreApi } from './surface-state'
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
  const layout = applyLayoutOperation(context.store.getState().layout, operation)
  context.store.getState().replaceLayout(layout)
  context.commitLayout(layout)
}
