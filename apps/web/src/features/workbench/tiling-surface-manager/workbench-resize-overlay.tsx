import { layoutRectStyle } from './workbench-layout-style'
import type { ResizeHandleLayoutRect } from './layout-geometry'
import type { LayoutOperation } from './layout-types'

const KEYBOARD_RESIZE_DELTA_PX = 32

export function WorkbenchResizeOverlay({
  resizeHandleRects,
  onDispatch,
}: {
  readonly resizeHandleRects: readonly ResizeHandleLayoutRect[]
  readonly onDispatch: (operation: LayoutOperation) => void
}) {
  if (resizeHandleRects.length === 0) return null

  return (
    <div
      aria-label='Workbench resize handles'
      className='absolute inset-0 z-30'
      data-workbench-resize-overlay=''
    >
      {resizeHandleRects.map((handle) => (
        <div
          aria-label={resizeHandleLabel(handle)}
          aria-orientation={handle.axis === 'horizontal' ? 'vertical' : 'horizontal'}
          className='hover:bg-ring/25 focus-visible:bg-ring/30 focus-visible:ring-ring/60 absolute rounded-full transition-colors outline-none focus-visible:ring-1'
          data-resize-handle-id={handle.id}
          key={handle.id}
          role='separator'
          style={layoutRectStyle(handle.rect)}
          tabIndex={0}
          onKeyDown={(event) => {
            const deltaPx = keyboardResizeDelta(handle, event.key)
            if (deltaPx === 0) return

            event.preventDefault()
            onDispatch({
              deltaPx,
              handleIndex: handle.handleIndex,
              splitId: handle.splitId,
              type: 'resizeSplit',
            })
          }}
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
