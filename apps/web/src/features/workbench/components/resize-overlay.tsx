import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

import { layoutRectStyle } from '@/features/workbench/utils/layout-style'
import type { ResizeHandleLayoutRect } from '@/features/tiling-surface-manager/engine/layout-geometry'
import type { LayoutOperation } from '@/features/tiling-surface-manager/engine/layout-types'

const KEYBOARD_RESIZE_DELTA_PX = 32

type ResizeDragState = {
  readonly element: HTMLElement
  readonly handle: ResizeHandleSnapshot
  readonly pointerId: number
  previewDeltaPx: number
  previewFrameId: number | null
  readonly startClientX: number
  readonly startClientY: number
}

type ResizeHandleSnapshot = {
  readonly handleId: string
  readonly handleIndex: number
  readonly splitId: ResizeHandleLayoutRect['splitId']
}

type ResizePreviewState = {
  readonly deltaPx: number
  readonly handleId: string
} | null

export function ResizeOverlay({
  resizeHandleRects,
  onDispatch,
}: {
  readonly resizeHandleRects: readonly ResizeHandleLayoutRect[]
  readonly onDispatch: (operation: LayoutOperation) => void
}) {
  const dragRef = useRef<ResizeDragState | null>(null)
  const [preview, setPreview] = useState<ResizePreviewState>(null)

  useEffect(() => {
    function handleWindowBlur() {
      cancelPointerDrag(dragRef, setPreview)
    }

    function handleWindowPointerCancel(event: PointerEvent) {
      const drag = dragRef.current
      if (!drag) return
      if (drag.pointerId !== event.pointerId) return

      cancelPointerDrag(dragRef, setPreview)
    }

    function handleWindowPointerUp(event: PointerEvent) {
      const drag = dragRef.current
      if (!drag) return
      if (drag.pointerId !== event.pointerId) return

      commitPointerDrag(dragRef, setPreview, onDispatch)
    }

    window.addEventListener('blur', handleWindowBlur)
    window.addEventListener('pointercancel', handleWindowPointerCancel)
    window.addEventListener('pointerup', handleWindowPointerUp)

    return () => {
      cancelPointerDrag(dragRef, setPreview)
      window.removeEventListener('blur', handleWindowBlur)
      window.removeEventListener('pointercancel', handleWindowPointerCancel)
      window.removeEventListener('pointerup', handleWindowPointerUp)
    }
  }, [onDispatch])
  if (resizeHandleRects.length === 0) return null

  function handlePointerDown(
    event: ReactPointerEvent<HTMLElement>,
    handle: ResizeHandleLayoutRect,
  ) {
    if (event.button !== 0) return

    event.preventDefault()
    capturePointer(event.currentTarget, event.pointerId)
    dragRef.current = {
      element: event.currentTarget,
      handle: resizeHandleSnapshot(handle),
      pointerId: event.pointerId,
      previewDeltaPx: 0,
      previewFrameId: null,
      startClientX: event.clientX,
      startClientY: event.clientY,
    }
    setPreview(null)
  }

  function handlePointerMove(
    event: ReactPointerEvent<HTMLElement>,
    handle: ResizeHandleLayoutRect,
  ) {
    const drag = dragRef.current
    if (!drag) return
    if (drag.pointerId !== event.pointerId) return
    if (drag.handle.handleId !== handle.id) return
    if (!primaryPointerButtonIsDown(event)) {
      cancelPointerDrag(dragRef, setPreview)
      return
    }

    drag.previewDeltaPx = pointerResizeDelta(handle, event, drag)
    scheduleResizePreview(dragRef, setPreview)
  }

  function handlePointerCancel() {
    cancelPointerDrag(dragRef, setPreview)
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current
    if (!drag) return
    if (drag.pointerId !== event.pointerId) return

    commitPointerDrag(dragRef, setPreview, onDispatch)
  }

  return (
    <div
      aria-label='Workbench resize handles'
      className='pointer-events-none absolute inset-0 z-30'
      data-workbench-resize-overlay=''
    >
      {resizeHandleRects.map((handle) => (
        <div
          aria-label={resizeHandleLabel(handle)}
          aria-orientation={handle.axis === 'horizontal' ? 'vertical' : 'horizontal'}
          className={`${resizeHandleClassName(handle)} pointer-events-auto absolute rounded-full transition-[background-color,transform] will-change-transform outline-none`}
          data-resize-handle-id={handle.id}
          key={handle.id}
          role='separator'
          style={resizeHandleStyle(handle, preview)}
          tabIndex={0}
          onKeyDown={(event) => {
            const deltaPx = keyboardResizeDelta(handle, event.key)
            if (deltaPx === 0) return

            event.preventDefault()
            dispatchResize(onDispatch, resizeHandleSnapshot(handle), deltaPx)
          }}
          onPointerCancel={handlePointerCancel}
          onPointerDown={(event) => handlePointerDown(event, handle)}
          onLostPointerCapture={handlePointerCancel}
          onPointerMove={(event) => handlePointerMove(event, handle)}
          onPointerUp={handlePointerUp}
        />
      ))}
    </div>
  )
}

function keyboardResizeDelta(handle: ResizeHandleLayoutRect, key: string) {
  if (handle.axis === 'horizontal' && key === 'ArrowLeft') return -KEYBOARD_RESIZE_DELTA_PX
  if (handle.axis === 'horizontal' && key === 'ArrowRight') return KEYBOARD_RESIZE_DELTA_PX
  if (handle.axis === 'vertical' && key === 'ArrowUp') return -KEYBOARD_RESIZE_DELTA_PX
  if (handle.axis === 'vertical' && key === 'ArrowDown') return KEYBOARD_RESIZE_DELTA_PX

  return 0
}

function resizeHandleLabel(handle: ResizeHandleLayoutRect) {
  if (handle.axis === 'horizontal') return 'Resize columns'

  return 'Resize rows'
}

function resizeHandleClassName(handle: ResizeHandleLayoutRect) {
  const state =
    'hover:bg-ring/25 focus-visible:bg-ring/30 focus-visible:ring-ring/60 focus-visible:ring-1'
  if (handle.axis === 'horizontal') return `${state} cursor-col-resize`

  return `${state} cursor-row-resize`
}

function resizeHandleSnapshot(handle: ResizeHandleLayoutRect): ResizeHandleSnapshot {
  return {
    handleId: handle.id,
    handleIndex: handle.handleIndex,
    splitId: handle.splitId,
  }
}

function resizeHandleStyle(handle: ResizeHandleLayoutRect, preview: ResizePreviewState) {
  const transform = resizePreviewTransform(handle, preview)
  if (!transform) return layoutRectStyle(handle.rect)

  return {
    ...layoutRectStyle(handle.rect),
    transform,
  }
}

function resizePreviewTransform(handle: ResizeHandleLayoutRect, preview: ResizePreviewState) {
  if (!preview) return undefined
  if (preview.handleId !== handle.id) return undefined
  if (preview.deltaPx === 0) return undefined
  if (handle.axis === 'horizontal') return `translate3d(${preview.deltaPx}px, 0, 0)`

  return `translate3d(0, ${preview.deltaPx}px, 0)`
}

function pointerResizeDelta(
  handle: ResizeHandleLayoutRect,
  event: ReactPointerEvent<HTMLElement>,
  drag: ResizeDragState,
) {
  if (handle.axis === 'horizontal') return event.clientX - drag.startClientX

  return event.clientY - drag.startClientY
}

function primaryPointerButtonIsDown(event: ReactPointerEvent<HTMLElement>) {
  return (event.buttons & 1) === 1
}

function scheduleResizePreview(
  dragRef: { current: ResizeDragState | null },
  setPreview: (preview: ResizePreviewState) => void,
) {
  const drag = dragRef.current
  if (!drag) return
  if (drag.previewFrameId !== null) return

  drag.previewFrameId = requestResizeAnimationFrame(() => {
    const current = dragRef.current
    if (!current) return

    current.previewFrameId = null
    setPreview({
      deltaPx: current.previewDeltaPx,
      handleId: current.handle.handleId,
    })
  })
}

function commitPointerDrag(
  dragRef: { current: ResizeDragState | null },
  setPreview: (preview: ResizePreviewState) => void,
  onDispatch: (operation: LayoutOperation) => void,
) {
  const drag = dragRef.current
  if (!drag) return

  dragRef.current = null
  cancelResizePreviewFrame(drag)
  releasePointer(drag.element, drag.pointerId)
  setPreview(null)
  dispatchResize(onDispatch, drag.handle, drag.previewDeltaPx)
}

function cancelPointerDrag(
  dragRef: { current: ResizeDragState | null },
  setPreview: (preview: ResizePreviewState) => void,
) {
  const drag = dragRef.current
  if (!drag) return

  dragRef.current = null
  cancelResizePreviewFrame(drag)
  releasePointer(drag.element, drag.pointerId)
  setPreview(null)
}

function dispatchResize(
  onDispatch: (operation: LayoutOperation) => void,
  handle: ResizeHandleSnapshot,
  deltaPx: number,
) {
  if (deltaPx === 0) return

  onDispatch({
    deltaPx,
    handleIndex: handle.handleIndex,
    splitId: handle.splitId,
    type: 'resizeSplit',
  })
}

function requestResizeAnimationFrame(callback: FrameRequestCallback) {
  if (!window.requestAnimationFrame) {
    callback(0)
    return null
  }

  return window.requestAnimationFrame(callback)
}

function cancelResizePreviewFrame(drag: ResizeDragState) {
  if (drag.previewFrameId === null) return
  if (!window.cancelAnimationFrame) return

  window.cancelAnimationFrame(drag.previewFrameId)
  drag.previewFrameId = null
}

function capturePointer(element: HTMLElement, pointerId: number) {
  try {
    element.setPointerCapture?.(pointerId)
  } catch {
    // Synthetic browser-test pointer events may not register an active pointer.
  }
}

function releasePointer(element: HTMLElement, pointerId: number) {
  try {
    if (!element.hasPointerCapture?.(pointerId)) return

    element.releasePointerCapture(pointerId)
  } catch {
    // Ignore stale pointer capture when a drag is cancelled by the browser.
  }
}
