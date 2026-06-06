import { useRef, type PointerEvent } from 'react'

import { layoutRectStyle } from '@/features/workbench/utils/layout-style'
import type { ResizeHandleLayoutRect } from '@/features/tiling-surface-manager/utils/layout-geometry'
import type { LayoutOperation } from '@/features/tiling-surface-manager/utils/layout-types'

const KEYBOARD_RESIZE_DELTA_PX = 32

type ResizeDragState = {
  readonly handleId: string
  lastClientX: number
  lastClientY: number
}

export function ResizeOverlay({
  resizeHandleRects,
  onDispatch,
}: {
  readonly resizeHandleRects: readonly ResizeHandleLayoutRect[]
  readonly onDispatch: (operation: LayoutOperation) => void
}) {
  const dragRef = useRef<ResizeDragState | null>(null)
  if (resizeHandleRects.length === 0) return null

  function dispatchResize(handle: ResizeHandleLayoutRect, deltaPx: number) {
    if (deltaPx === 0) return

    onDispatch({
      deltaPx,
      handleIndex: handle.handleIndex,
      splitId: handle.splitId,
      type: 'resizeSplit',
    })
  }

  function handlePointerDown(event: PointerEvent<HTMLElement>, handle: ResizeHandleLayoutRect) {
    if (event.button !== 0) return

    event.preventDefault()
    capturePointer(event.currentTarget, event.pointerId)
    dragRef.current = {
      handleId: handle.id,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
    }
  }

  function handlePointerMove(event: PointerEvent<HTMLElement>, handle: ResizeHandleLayoutRect) {
    const drag = dragRef.current
    if (!drag) return
    if (drag.handleId !== handle.id) return

    const deltaPx = pointerResizeDelta(handle, event, drag)
    drag.lastClientX = event.clientX
    drag.lastClientY = event.clientY
    dispatchResize(handle, deltaPx)
  }

  function handlePointerEnd(event: PointerEvent<HTMLElement>) {
    if (!dragRef.current) return

    dragRef.current = null
    releasePointer(event.currentTarget, event.pointerId)
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
          className={`${resizeHandleClassName(handle)} pointer-events-auto absolute rounded-full transition-colors outline-none`}
          data-resize-handle-id={handle.id}
          key={handle.id}
          role='separator'
          style={layoutRectStyle(handle.rect)}
          tabIndex={0}
          onKeyDown={(event) => {
            const deltaPx = keyboardResizeDelta(handle, event.key)
            if (deltaPx === 0) return

            event.preventDefault()
            dispatchResize(handle, deltaPx)
          }}
          onPointerCancel={handlePointerEnd}
          onPointerDown={(event) => handlePointerDown(event, handle)}
          onPointerMove={(event) => handlePointerMove(event, handle)}
          onPointerUp={handlePointerEnd}
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

function pointerResizeDelta(
  handle: ResizeHandleLayoutRect,
  event: PointerEvent<HTMLElement>,
  drag: ResizeDragState,
) {
  if (handle.axis === 'horizontal') return event.clientX - drag.lastClientX

  return event.clientY - drag.lastClientY
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
