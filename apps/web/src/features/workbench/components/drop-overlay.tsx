import { useEffect, useState, type DragEvent as ReactDragEvent } from 'react'

import {
  EDITOR_TAB_POINTER_CANCEL_EVENT,
  EDITOR_TAB_POINTER_DRAG_EVENT,
  EDITOR_TAB_POINTER_DROP_EVENT,
  hasEditorTabDragPayload,
  isEditorTabPointerDragDetail,
  readEditorTabDragPayload,
} from '@/components/workspace/editor-tabs/hooks/use-editor-tab-drag'
import { layoutRectStyle } from '@/features/workbench/utils/layout-style'
import {
  WORKBENCH_WINDOW_POINTER_CANCEL_EVENT,
  WORKBENCH_WINDOW_POINTER_DRAG_EVENT,
  WORKBENCH_WINDOW_POINTER_DROP_EVENT,
  workbenchWindowPointerDragDetail,
} from '@/features/workbench/utils/window-drag-events'
import type { DropZoneLayoutRect } from '@/features/tiling-surface-manager/engine/layout-geometry'
import type {
  LayoutOperation,
  SurfaceId,
} from '@/features/tiling-surface-manager/engine/layout-types'

export function DropOverlay({
  dropZoneRects,
  surfaceIdForEditorTabId,
  onDispatch,
}: {
  readonly dropZoneRects: readonly DropZoneLayoutRect[]
  readonly surfaceIdForEditorTabId?: (tabId: string) => SurfaceId | null
  readonly onDispatch: (operation: LayoutOperation) => void
}) {
  const [activeDropZoneId, setActiveDropZoneId] = useState<string | null>(null)
  const [acceptingDrop, setAcceptingDrop] = useState(false)

  useEffect(() => {
    if (!surfaceIdForEditorTabId) {
      setAcceptingDrop(false)
      setActiveDropZoneId(null)
      return
    }

    function handleDocumentDrag(event: globalThis.DragEvent) {
      if (!hasEditorTabDragPayload(event.dataTransfer)) return

      setAcceptingDrop(true)
    }

    function clearDocumentDrag() {
      setAcceptingDrop(false)
      setActiveDropZoneId(null)
    }

    document.addEventListener('dragenter', handleDocumentDrag, true)
    document.addEventListener('dragover', handleDocumentDrag, true)
    document.addEventListener('drop', clearDocumentDrag, true)
    document.addEventListener('dragend', clearDocumentDrag, true)

    return () => {
      document.removeEventListener('dragenter', handleDocumentDrag, true)
      document.removeEventListener('dragover', handleDocumentDrag, true)
      document.removeEventListener('drop', clearDocumentDrag, true)
      document.removeEventListener('dragend', clearDocumentDrag, true)
    }
  }, [surfaceIdForEditorTabId])

  useEffect(() => {
    if (!surfaceIdForEditorTabId) {
      setAcceptingDrop(false)
      setActiveDropZoneId(null)
      return
    }

    function clearPointerDrag() {
      setAcceptingDrop(false)
      setActiveDropZoneId(null)
    }

    function handlePointerDrag(event: Event) {
      const detail = pointerDragDetail(event)
      if (!detail) return

      if (!detail.detached) {
        clearPointerDrag()
        return
      }

      const surfaceId = surfaceIdForEditorTabId?.(detail.tabId)
      if (!surfaceId) {
        clearPointerDrag()
        return
      }

      setAcceptingDrop(true)
      setActiveDropZoneId(
        dropZoneAtPoint(dropZoneRects, detail.clientX, detail.clientY)?.id ?? null,
      )
    }

    function handlePointerDrop(event: Event) {
      const detail = pointerDragDetail(event)
      clearPointerDrag()
      if (!detail?.detached) return

      const surfaceId = surfaceIdForEditorTabId?.(detail.tabId)
      const dropZone = dropZoneAtPoint(dropZoneRects, detail.clientX, detail.clientY)
      if (!surfaceId) return
      if (!dropZone) return

      onDispatch({
        destination: dropZone.destination,
        surfaceId,
        type: 'moveSurface',
      })
    }

    document.addEventListener(EDITOR_TAB_POINTER_DRAG_EVENT, handlePointerDrag)
    document.addEventListener(EDITOR_TAB_POINTER_DROP_EVENT, handlePointerDrop)
    document.addEventListener(EDITOR_TAB_POINTER_CANCEL_EVENT, clearPointerDrag)

    return () => {
      document.removeEventListener(EDITOR_TAB_POINTER_DRAG_EVENT, handlePointerDrag)
      document.removeEventListener(EDITOR_TAB_POINTER_DROP_EVENT, handlePointerDrop)
      document.removeEventListener(EDITOR_TAB_POINTER_CANCEL_EVENT, clearPointerDrag)
    }
  }, [dropZoneRects, onDispatch, surfaceIdForEditorTabId])

  useEffect(() => {
    function clearWindowDrag() {
      setAcceptingDrop(false)
      setActiveDropZoneId(null)
    }

    function handleWindowDrag(event: Event) {
      const detail = workbenchWindowPointerDragDetail(event)
      if (!detail) return

      setAcceptingDrop(true)
      setActiveDropZoneId(
        dropZoneAtPoint(dropZoneRects, detail.clientX, detail.clientY)?.id ?? null,
      )
    }

    function handleWindowDrop(event: Event) {
      const detail = workbenchWindowPointerDragDetail(event)
      clearWindowDrag()
      if (!detail) return

      const dropZone = dropZoneAtPoint(dropZoneRects, detail.clientX, detail.clientY)
      if (!dropZone) return

      onDispatch({
        destination: dropZone.destination,
        type: 'moveWindow',
        windowId: detail.windowId,
      })
    }

    document.addEventListener(WORKBENCH_WINDOW_POINTER_DRAG_EVENT, handleWindowDrag)
    document.addEventListener(WORKBENCH_WINDOW_POINTER_DROP_EVENT, handleWindowDrop)
    document.addEventListener(WORKBENCH_WINDOW_POINTER_CANCEL_EVENT, clearWindowDrag)

    return () => {
      document.removeEventListener(WORKBENCH_WINDOW_POINTER_DRAG_EVENT, handleWindowDrag)
      document.removeEventListener(WORKBENCH_WINDOW_POINTER_DROP_EVENT, handleWindowDrop)
      document.removeEventListener(WORKBENCH_WINDOW_POINTER_CANCEL_EVENT, clearWindowDrag)
    }
  }, [dropZoneRects, onDispatch])

  if (dropZoneRects.length === 0) return null

  return (
    <div
      aria-label='Workbench drop targets'
      className='pointer-events-none absolute inset-0 z-40'
      data-workbench-drop-overlay=''
    >
      {dropZoneRects.map((dropZone) => {
        const active = activeDropZoneId === dropZone.id

        return (
          <div
            aria-label={dropZoneLabel(dropZone)}
            className='data-[kind=window-center]:bg-ring/10 data-[kind=window-edge]:bg-ring/12 data-[kind=root-edge]:bg-primary/10 data-[kind=parent-edge]:bg-accent/20 data-[active=true]:border-ring pointer-events-none absolute rounded-[4px] border border-transparent opacity-0 transition-opacity data-[accepting=true]:pointer-events-auto data-[active=true]:opacity-100'
            data-accepting={acceptingDrop ? 'true' : undefined}
            data-active={active ? 'true' : undefined}
            data-drop-zone-id={dropZone.id}
            data-kind={dropZone.kind}
            key={dropZone.id}
            role='button'
            style={layoutRectStyle(dropZone.rect)}
            tabIndex={-1}
            onDragLeave={(event) => handleDragLeave(event, setActiveDropZoneId)}
            onDragOver={(event) =>
              handleDragOver(event, dropZone, surfaceIdForEditorTabId, setActiveDropZoneId)
            }
            onDrop={(event) =>
              handleDrop(
                event,
                dropZone,
                surfaceIdForEditorTabId,
                onDispatch,
                setActiveDropZoneId,
                setAcceptingDrop,
              )
            }
          />
        )
      })}
    </div>
  )
}

function dropZoneLabel(dropZone: DropZoneLayoutRect) {
  if (dropZone.kind === 'window-center') return `Drop on window ${dropZone.windowId}`
  if (dropZone.edge) return `Drop ${dropZone.kind} ${dropZone.edge}`

  return `Drop ${dropZone.kind}`
}

function handleDragOver(
  event: ReactDragEvent<HTMLElement>,
  dropZone: DropZoneLayoutRect,
  surfaceIdForEditorTabId: ((tabId: string) => SurfaceId | null) | undefined,
  setActiveDropZoneId: (dropZoneId: string | null) => void,
) {
  if (!canAcceptEditorTabDrop(event, surfaceIdForEditorTabId)) return

  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
  setActiveDropZoneId(dropZone.id)
}

function handleDragLeave(
  event: ReactDragEvent<HTMLElement>,
  setActiveDropZoneId: (dropZoneId: string | null) => void,
) {
  if (event.currentTarget.contains(event.relatedTarget as Node | null)) return

  setActiveDropZoneId(null)
}

function handleDrop(
  event: ReactDragEvent<HTMLElement>,
  dropZone: DropZoneLayoutRect,
  surfaceIdForEditorTabId: ((tabId: string) => SurfaceId | null) | undefined,
  onDispatch: (operation: LayoutOperation) => void,
  setActiveDropZoneId: (dropZoneId: string | null) => void,
  setAcceptingDrop: (accepting: boolean) => void,
) {
  const surfaceId = droppedSurfaceId(event, surfaceIdForEditorTabId)
  setActiveDropZoneId(null)
  setAcceptingDrop(false)
  if (!surfaceId) return

  event.preventDefault()
  event.stopPropagation()
  event.dataTransfer.dropEffect = 'move'
  onDispatch({
    destination: dropZone.destination,
    surfaceId,
    type: 'moveSurface',
  })
}

function canAcceptEditorTabDrop(
  event: ReactDragEvent<HTMLElement>,
  surfaceIdForEditorTabId: ((tabId: string) => SurfaceId | null) | undefined,
) {
  if (!surfaceIdForEditorTabId) return false

  return hasEditorTabDragPayload(event.dataTransfer)
}

function droppedSurfaceId(
  event: ReactDragEvent<HTMLElement>,
  surfaceIdForEditorTabId: ((tabId: string) => SurfaceId | null) | undefined,
): SurfaceId | null {
  if (!surfaceIdForEditorTabId) return null

  const result = readEditorTabDragPayload(event.dataTransfer)
  if (result.status !== 'valid') return null

  return surfaceIdForEditorTabId(result.payload.tabId)
}

function pointerDragDetail(event: Event) {
  if (!(event instanceof CustomEvent)) return null
  if (!isEditorTabPointerDragDetail(event.detail)) return null

  return event.detail
}

function dropZoneAtPoint(
  dropZoneRects: readonly DropZoneLayoutRect[],
  clientX: number,
  clientY: number,
) {
  return (
    dropZoneRects.find((dropZone) => {
      const rect = dropZone.rect
      if (clientX < rect.x) return false
      if (clientX > rect.x + rect.width) return false
      if (clientY < rect.y) return false

      return clientY <= rect.y + rect.height
    }) ?? null
  )
}
