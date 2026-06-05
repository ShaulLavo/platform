import type { RequestCloseTab } from '@/features/editor/hooks/use-dirty-tab-close'
import type { EditorCommands } from '@/features/editor/state/editor-commands'

import { applyLayoutOperation } from './layout-operations'
import type { DropDestination, LayoutOperation, SurfaceId, WindowId } from './layout-types'
import type { WorkspaceLayoutStoreApi } from './surface-state'
import {
  editorPaneIdForWorkbenchWindowId,
  editorSurfaceSerializedState,
  type EditorSurfaceSerializedState,
} from './workbench-editor-surface-layout'

type EditorSurfaceCommands = Pick<
  EditorCommands,
  'moveTabToPane' | 'moveTabToSplit' | 'reorderTab' | 'selectTab'
>

export type WorkbenchEditorSurfaceDispatchContext = {
  readonly commands: EditorSurfaceCommands
  readonly requestCloseTab: RequestCloseTab
  readonly store: WorkspaceLayoutStoreApi
}

export function dispatchWorkbenchEditorSurfaceOperation(
  operation: LayoutOperation,
  context: WorkbenchEditorSurfaceDispatchContext,
) {
  if (dispatchEditorSurfaceOperation(operation, context)) return

  dispatchPureSurfaceOperation(operation, context.store)
}

function dispatchEditorSurfaceOperation(
  operation: LayoutOperation,
  context: WorkbenchEditorSurfaceDispatchContext,
) {
  switch (operation.type) {
    case 'activateSurface':
      return activateEditorSurface(operation.surfaceId, context)
    case 'closeSurface':
      return closeEditorSurface(operation.surfaceId, context)
    case 'moveSurface':
      return moveEditorSurface(operation.surfaceId, operation.destination, context)
    case 'reorderSurface':
      return reorderEditorSurface(
        operation.windowId,
        operation.fromIndex,
        operation.toIndex,
        context,
      )
    case 'splitWindow':
      return splitEditorSurface(operation, context)
    case 'tabSurface':
      return tabEditorSurface(
        operation.surfaceId,
        operation.targetWindowId,
        operation.index,
        context,
      )
    default:
      return false
  }
}

function activateEditorSurface(
  surfaceId: SurfaceId,
  context: WorkbenchEditorSurfaceDispatchContext,
) {
  const editorState = editorStateForSurfaceId(context.store, surfaceId)
  if (!editorState) return false

  context.commands.selectTab(editorState.editorPaneId, editorState.editorTabId)
  return true
}

function closeEditorSurface(surfaceId: SurfaceId, context: WorkbenchEditorSurfaceDispatchContext) {
  const editorState = editorStateForSurfaceId(context.store, surfaceId)
  if (!editorState) return false

  context.requestCloseTab(editorState.editorTabId)
  return true
}

function moveEditorSurface(
  surfaceId: SurfaceId,
  destination: DropDestination,
  context: WorkbenchEditorSurfaceDispatchContext,
) {
  if (destination.kind === 'window-center') {
    return tabEditorSurface(surfaceId, destination.windowId, destination.tabIndex, context)
  }
  if (destination.kind === 'window-edge') {
    return splitEditorSurfaceIntoWindow(surfaceId, destination.windowId, destination.edge, context)
  }
  if (destination.kind === 'root-edge') {
    return splitEditorSurfaceFromSource(surfaceId, destination.edge, 'root', context)
  }

  return false
}

function reorderEditorSurface(
  windowId: WindowId,
  fromIndex: number,
  toIndex: number,
  context: WorkbenchEditorSurfaceDispatchContext,
) {
  const surfaceId = context.store.getState().layout.windowsById[windowId]?.surfaceIds[fromIndex]
  if (!surfaceId) return false

  const editorState = editorStateForSurfaceId(context.store, surfaceId)
  if (!editorState) return false

  context.commands.reorderTab(editorState.editorPaneId, editorState.editorTabId, toIndex)
  return true
}

function splitEditorSurface(
  operation: Extract<LayoutOperation, { readonly type: 'splitWindow' }>,
  context: WorkbenchEditorSurfaceDispatchContext,
) {
  if (!operation.surfaceId) return false

  return splitEditorSurfaceIntoWindow(
    operation.surfaceId,
    operation.windowId,
    operation.edge,
    context,
  )
}

function tabEditorSurface(
  surfaceId: SurfaceId,
  targetWindowId: WindowId,
  targetIndex: number | undefined,
  context: WorkbenchEditorSurfaceDispatchContext,
) {
  const sourceState = editorStateForSurfaceId(context.store, surfaceId)
  const targetPaneId = editorPaneIdForWindow(context.store, targetWindowId)
  if (!sourceState || !targetPaneId) return false

  context.commands.moveTabToPane(sourceState.editorTabId, targetPaneId, targetIndex)
  return true
}

function splitEditorSurfaceIntoWindow(
  surfaceId: SurfaceId,
  targetWindowId: WindowId,
  edge: Exclude<DropDestination, { readonly kind: 'rail' | 'window-center' }>['edge'],
  context: WorkbenchEditorSurfaceDispatchContext,
) {
  const sourceState = editorStateForSurfaceId(context.store, surfaceId)
  const targetPaneId = editorPaneIdForWindow(context.store, targetWindowId)
  if (!sourceState || !targetPaneId) return false

  context.commands.moveTabToSplit(sourceState.editorTabId, targetPaneId, edge, 'pane')
  return true
}

function splitEditorSurfaceFromSource(
  surfaceId: SurfaceId,
  edge: Exclude<DropDestination, { readonly kind: 'rail' | 'window-center' }>['edge'],
  scope: 'root',
  context: WorkbenchEditorSurfaceDispatchContext,
) {
  const sourceState = editorStateForSurfaceId(context.store, surfaceId)
  if (!sourceState) return false

  context.commands.moveTabToSplit(sourceState.editorTabId, sourceState.editorPaneId, edge, scope)
  return true
}

function editorStateForSurfaceId(
  store: WorkspaceLayoutStoreApi,
  surfaceId: SurfaceId,
): EditorSurfaceSerializedState | null {
  const surface = store.getState().layout.surfacesById[surfaceId]
  if (!surface) return null

  return editorSurfaceSerializedState(surface)
}

function editorPaneIdForWindow(store: WorkspaceLayoutStoreApi, windowId: WindowId) {
  const paneId = editorPaneIdForWorkbenchWindowId(windowId)
  if (paneId) return paneId

  const activeSurfaceId = store.getState().layout.windowsById[windowId]?.activeSurfaceId
  if (!activeSurfaceId) return null

  return editorStateForSurfaceId(store, activeSurfaceId)?.editorPaneId ?? null
}

function dispatchPureSurfaceOperation(operation: LayoutOperation, store: WorkspaceLayoutStoreApi) {
  store.getState().replaceLayout(applyLayoutOperation(store.getState().layout, operation))
}
