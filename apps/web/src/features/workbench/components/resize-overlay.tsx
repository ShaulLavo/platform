import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'

import { layoutRectStyle } from '@/features/workbench/utils/layout-style'
import type { ResizeHandleLayoutRect } from '@/features/tiling-surface-manager/engine/layout-geometry'
import type { LayoutOperation } from '@/features/tiling-surface-manager/engine/layout-types'

const KEYBOARD_RESIZE_DELTA_PX = 32

type ResizeDragState = {
  readonly element: HTMLElement
  readonly handle: ResizeHandleSnapshot
  lastClientX: number
  lastClientY: number
  readonly pointerId: number
}

type ResizeHandleSnapshot = {
  readonly axis: ResizeHandleLayoutRect['axis']
  readonly handleId: string
  readonly handleIndex: number
  readonly referencePx: number
  readonly splitId: ResizeHandleLayoutRect['splitId']
}

export function ResizeOverlay({
  resizeHandleRects,
  onDispatch,
}: {
  readonly resizeHandleRects: readonly ResizeHandleLayoutRect[]
  readonly onDispatch: (operation: LayoutOperation) => void
}) {
  const dragRef = useRef<ResizeDragState | null>(null)
  const onDispatchRef = useRef(onDispatch)

  useEffect(() => {
    onDispatchRef.current = onDispatch
  }, [onDispatch])

  useEffect(() => {
    function handleWindowBlur() {
      cancelPointerDrag(dragRef)
    }

    function handleWindowPointerCancel(event: PointerEvent) {
      const drag = dragRef.current
      if (!drag) return
      if (drag.pointerId !== event.pointerId) return

      cancelPointerDrag(dragRef)
    }

    function handleWindowPointerMove(event: PointerEvent) {
      const drag = dragRef.current
      if (!drag) return
      if (drag.pointerId !== event.pointerId) return
      if (!primaryPointerButtonIsDown(event)) {
        cancelPointerDrag(dragRef)
        return
      }

      dispatchPointerDragDelta(dragRef, onDispatchRef.current, event)
    }

    function handleWindowPointerUp(event: PointerEvent) {
      const drag = dragRef.current
      if (!drag) return
      if (drag.pointerId !== event.pointerId) return

      finishPointerDrag(dragRef, onDispatchRef.current, event)
    }

    window.addEventListener('blur', handleWindowBlur)
    window.addEventListener('pointercancel', handleWindowPointerCancel, true)
    window.addEventListener('pointermove', handleWindowPointerMove, true)
    window.addEventListener('pointerup', handleWindowPointerUp, true)

    return () => {
      cancelPointerDrag(dragRef)
      window.removeEventListener('blur', handleWindowBlur)
      window.removeEventListener('pointercancel', handleWindowPointerCancel, true)
      window.removeEventListener('pointermove', handleWindowPointerMove, true)
      window.removeEventListener('pointerup', handleWindowPointerUp, true)
    }
  }, [])
  if (resizeHandleRects.length === 0) return null

  function handlePointerDown(
    event: ReactPointerEvent<HTMLElement>,
    handle: ResizeHandleLayoutRect,
  ) {
    if (event.button !== 0) return

    event.preventDefault()
    stopResizePointerStart(event)
    capturePointer(event.currentTarget, event.pointerId)
    dragRef.current = {
      element: event.currentTarget,
      handle: resizeHandleSnapshot(handle),
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      pointerId: event.pointerId,
    }
  }

  function handlePointerCancel() {
    cancelPointerDrag(dragRef)
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current
    if (!drag) return
    if (drag.pointerId !== event.pointerId) return

    finishPointerDrag(dragRef, onDispatch, event)
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
          className={`${resizeHandleClassName(handle)} pointer-events-auto absolute rounded-full transition-[background-color] outline-none`}
          data-resize-handle-id={handle.id}
          key={handle.id}
          role='separator'
          style={layoutRectStyle(handle.rect)}
          tabIndex={0}
          onKeyDown={(event) => {
            const deltaPx = keyboardResizeDelta(handle, event.key)
            if (deltaPx === 0) return

            event.preventDefault()
            dispatchResize(onDispatch, resizeHandleSnapshot(handle), deltaPx)
          }}
          onPointerCancel={handlePointerCancel}
          onPointerDown={(event) => handlePointerDown(event, handle)}
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
    axis: handle.axis,
    handleId: handle.id,
    handleIndex: handle.handleIndex,
    referencePx: handle.resizeReferencePx,
    splitId: handle.splitId,
  }
}

function primaryPointerButtonIsDown(
  event: Pick<PointerEvent | ReactPointerEvent<HTMLElement>, 'buttons'>,
) {
  return (event.buttons & 1) === 1
}

function stopResizePointerStart(event: ReactPointerEvent<HTMLElement>) {
  event.stopPropagation()
  event.nativeEvent.stopImmediatePropagation()
}

function dispatchPointerDragDelta(
  dragRef: { current: ResizeDragState | null },
  onDispatch: (operation: LayoutOperation) => void,
  event: Pick<PointerEvent | ReactPointerEvent<HTMLElement>, 'clientX' | 'clientY'>,
) {
  const drag = dragRef.current
  if (!drag) return
  const deltaPx = pointerResizeDelta(event, drag)
  if (deltaPx === 0) return

  drag.lastClientX = event.clientX
  drag.lastClientY = event.clientY
  dispatchResize(onDispatch, drag.handle, deltaPx)
}

function pointerResizeDelta(
  event: Pick<PointerEvent | ReactPointerEvent<HTMLElement>, 'clientX' | 'clientY'>,
  drag: ResizeDragState,
) {
  if (drag.handle.axis === 'horizontal') return event.clientX - drag.lastClientX

  return event.clientY - drag.lastClientY
}

function finishPointerDrag(
  dragRef: { current: ResizeDragState | null },
  onDispatch: (operation: LayoutOperation) => void,
  event: Pick<PointerEvent | ReactPointerEvent<HTMLElement>, 'clientX' | 'clientY'>,
) {
  const drag = dragRef.current
  if (!drag) return

  dispatchPointerDragDelta(dragRef, onDispatch, event)
  dragRef.current = null
  releasePointer(drag.element, drag.pointerId)
}

function cancelPointerDrag(dragRef: { current: ResizeDragState | null }) {
  const drag = dragRef.current
  if (!drag) return

  dragRef.current = null
  releasePointer(drag.element, drag.pointerId)
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
    referencePx: handle.referencePx,
    splitId: handle.splitId,
    type: 'resizeSplit',
  })
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
