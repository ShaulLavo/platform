import { useEffect } from 'react'

import {
  EDITOR_TAB_POINTER_CANCEL_EVENT,
  EDITOR_TAB_POINTER_DRAG_EVENT,
  EDITOR_TAB_POINTER_DROP_EVENT,
  hasEditorTabDragPayload,
  isEditorTabPointerDragDetail,
  readEditorTabDragPayload,
} from '@/components/workspace/editor-tabs/hooks/use-editor-tab-drag'
import type { SnapDestinationLayoutRect } from '@/features/tiling-surface-manager/engine/layout-geometry'
import type {
  LayoutOperation,
  SurfaceId,
  WindowId,
} from '@/features/tiling-surface-manager/engine/layout-types'
import {
  WORKBENCH_WINDOW_POINTER_CANCEL_EVENT,
  WORKBENCH_WINDOW_POINTER_DRAG_EVENT,
  WORKBENCH_WINDOW_POINTER_DROP_EVENT,
  workbenchWindowPointerDragDetail,
} from '@/features/workbench/utils/window-drag-events'

export function SnappedDragController({
  snapDestinationRects,
  surfaceIdForEditorTabId,
  onDispatch,
  onPreview,
}: {
  readonly snapDestinationRects: readonly SnapDestinationLayoutRect[]
  readonly surfaceIdForEditorTabId?: (tabId: string) => SurfaceId | null
  readonly onDispatch: (operation: LayoutOperation) => void
  readonly onPreview?: (operation: LayoutOperation | null) => void
}) {
  useEffect(() => () => onPreview?.(null), [onPreview])

  useEffect(() => {
    if (!surfaceIdForEditorTabId) {
      onPreview?.(null)
      return
    }

    const resolveSurfaceId = surfaceIdForEditorTabId

    function handleDocumentDragOver(event: globalThis.DragEvent) {
      const operation = surfaceDragOperationFromDocumentEvent(
        event,
        snapDestinationRects,
        resolveSurfaceId,
      )
      if (!operation) {
        onPreview?.(null)
        return
      }

      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
      onPreview?.(operation)
    }

    function handleDocumentDrop(event: globalThis.DragEvent) {
      const operation = surfaceDragOperationFromDocumentEvent(
        event,
        snapDestinationRects,
        resolveSurfaceId,
      )
      onPreview?.(null)
      if (!operation) return

      event.preventDefault()
      event.stopPropagation()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
      onDispatch(operation)
    }

    const handlePreviewClear = clearPreview(onPreview)
    document.addEventListener('dragover', handleDocumentDragOver, {
      capture: true,
      passive: false,
    })
    document.addEventListener('drop', handleDocumentDrop, {
      capture: true,
      passive: false,
    })
    document.addEventListener('dragend', handlePreviewClear, true)

    return () => {
      document.removeEventListener('dragover', handleDocumentDragOver, true)
      document.removeEventListener('drop', handleDocumentDrop, true)
      document.removeEventListener('dragend', handlePreviewClear, true)
    }
  }, [onDispatch, onPreview, snapDestinationRects, surfaceIdForEditorTabId])

  useEffect(() => {
    if (!surfaceIdForEditorTabId) {
      onPreview?.(null)
      return
    }

    const resolveSurfaceId = surfaceIdForEditorTabId

    function handlePointerDrag(event: Event) {
      const operation = surfaceDragOperationFromPointerEvent(
        event,
        snapDestinationRects,
        resolveSurfaceId,
      )
      onPreview?.(operation)
    }

    function handlePointerDrop(event: Event) {
      const operation = surfaceDragOperationFromPointerEvent(
        event,
        snapDestinationRects,
        resolveSurfaceId,
      )
      onPreview?.(null)
      if (!operation) return

      onDispatch(operation)
    }

    const handlePreviewClear = clearPreview(onPreview)
    document.addEventListener(EDITOR_TAB_POINTER_DRAG_EVENT, handlePointerDrag)
    document.addEventListener(EDITOR_TAB_POINTER_DROP_EVENT, handlePointerDrop)
    document.addEventListener(EDITOR_TAB_POINTER_CANCEL_EVENT, handlePreviewClear)

    return () => {
      document.removeEventListener(EDITOR_TAB_POINTER_DRAG_EVENT, handlePointerDrag)
      document.removeEventListener(EDITOR_TAB_POINTER_DROP_EVENT, handlePointerDrop)
      document.removeEventListener(EDITOR_TAB_POINTER_CANCEL_EVENT, handlePreviewClear)
    }
  }, [onDispatch, onPreview, snapDestinationRects, surfaceIdForEditorTabId])

  useEffect(() => {
    function handleWindowDrag(event: Event) {
      const operation = windowDragOperationFromEvent(event, snapDestinationRects)
      onPreview?.(operation)
    }

    function handleWindowDrop(event: Event) {
      const operation = windowDragOperationFromEvent(event, snapDestinationRects)
      onPreview?.(null)
      if (!operation) return

      onDispatch(operation)
    }

    const handlePreviewClear = clearPreview(onPreview)
    document.addEventListener(WORKBENCH_WINDOW_POINTER_DRAG_EVENT, handleWindowDrag)
    document.addEventListener(WORKBENCH_WINDOW_POINTER_DROP_EVENT, handleWindowDrop)
    document.addEventListener(WORKBENCH_WINDOW_POINTER_CANCEL_EVENT, handlePreviewClear)

    return () => {
      document.removeEventListener(WORKBENCH_WINDOW_POINTER_DRAG_EVENT, handleWindowDrag)
      document.removeEventListener(WORKBENCH_WINDOW_POINTER_DROP_EVENT, handleWindowDrop)
      document.removeEventListener(WORKBENCH_WINDOW_POINTER_CANCEL_EVENT, handlePreviewClear)
    }
  }, [onDispatch, onPreview, snapDestinationRects])

  return null
}

function clearPreview(onPreview: ((operation: LayoutOperation | null) => void) | undefined) {
  return () => onPreview?.(null)
}

function surfaceDragOperationFromDocumentEvent(
  event: globalThis.DragEvent,
  snapDestinationRects: readonly SnapDestinationLayoutRect[],
  surfaceIdForEditorTabId: (tabId: string) => SurfaceId | null,
): LayoutOperation | null {
  if (!hasEditorTabDragPayload(event.dataTransfer)) return null

  const surfaceId = surfaceIdFromDataTransfer(event.dataTransfer, surfaceIdForEditorTabId)
  if (!surfaceId) return null

  const destination = snapDestinationAtPoint(snapDestinationRects, event.clientX, event.clientY)
  if (!destination) return null

  return moveSurfaceOperation(surfaceId, destination)
}

function surfaceDragOperationFromPointerEvent(
  event: Event,
  snapDestinationRects: readonly SnapDestinationLayoutRect[],
  surfaceIdForEditorTabId: (tabId: string) => SurfaceId | null,
): LayoutOperation | null {
  const detail = pointerDragDetail(event)
  if (!detail?.detached) return null

  const surfaceId = surfaceIdForEditorTabId(detail.tabId)
  if (!surfaceId) return null

  const destination = snapDestinationAtPoint(snapDestinationRects, detail.clientX, detail.clientY)
  if (!destination) return null

  return moveSurfaceOperation(surfaceId, destination)
}

function windowDragOperationFromEvent(
  event: Event,
  snapDestinationRects: readonly SnapDestinationLayoutRect[],
): LayoutOperation | null {
  const detail = workbenchWindowPointerDragDetail(event)
  if (!detail) return null

  const destination = snapDestinationAtPoint(snapDestinationRects, detail.clientX, detail.clientY)
  if (!destination) return null

  return moveWindowOperation(detail.windowId, destination)
}

function surfaceIdFromDataTransfer(
  dataTransfer: DataTransfer | null,
  surfaceIdForEditorTabId: (tabId: string) => SurfaceId | null,
): SurfaceId | null {
  const result = readEditorTabDragPayload(dataTransfer)
  if (result.status !== 'valid') return null

  return surfaceIdForEditorTabId(result.payload.tabId)
}

function pointerDragDetail(event: Event) {
  if (!(event instanceof CustomEvent)) return null
  if (!isEditorTabPointerDragDetail(event.detail)) return null

  return event.detail
}

function moveSurfaceOperation(
  surfaceId: SurfaceId,
  destination: SnapDestinationLayoutRect,
): LayoutOperation {
  return {
    destination: destination.destination,
    surfaceId,
    type: 'moveSurface',
  }
}

function moveWindowOperation(
  windowId: WindowId,
  destination: SnapDestinationLayoutRect,
): LayoutOperation {
  return {
    destination: destination.destination,
    type: 'moveWindow',
    windowId,
  }
}

function snapDestinationAtPoint(
  snapDestinationRects: readonly SnapDestinationLayoutRect[],
  clientX: number,
  clientY: number,
) {
  return (
    snapDestinationRects.find((destination) => {
      const rect = destination.rect
      if (clientX < rect.x) return false
      if (clientX > rect.x + rect.width) return false
      if (clientY < rect.y) return false

      return clientY <= rect.y + rect.height
    }) ?? null
  )
}
