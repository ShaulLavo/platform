import { ArrowsInSimpleIcon, ArrowsOutSimpleIcon, MinusIcon, XIcon } from '@phosphor-icons/react'
import { memo, useRef, type FocusEvent, type PointerEvent } from 'react'
import { cn } from '@workspace/ui/lib/utils'

import { SurfaceHost } from '@/features/workbench/components/surface-host'
import { TabStrip } from '@/features/workbench/components/tab-strip'
import { WindowControlButton } from '@/features/workbench/components/window-control-button'
import { layoutRectStyle } from '@/features/workbench/utils/layout-style'
import { surfacesAreEqual } from '@/features/workbench/utils/surface-equality'
import type { LayoutRect } from '@/features/tiling-surface-manager/engine/layout-geometry'
import type {
  LayoutOperation,
  Surface,
  WindowId,
  WorkbenchWindow,
  WorkspaceLayout,
} from '@/features/tiling-surface-manager/engine/layout-types'
import type { SurfaceRendererRegistry } from '@/features/workbench/utils/surface-renderer-registry'
import { useLayoutState } from '@/features/workbench/hooks/use-layout-state'
import {
  WORKBENCH_WINDOW_DRAG_START_THRESHOLD_PX,
  WORKBENCH_WINDOW_POINTER_DRAG_EVENT,
  WORKBENCH_WINDOW_POINTER_DROP_EVENT,
  dispatchWorkbenchWindowPointerCancelEvent,
  dispatchWorkbenchWindowPointerDragEvent,
} from '@/features/workbench/utils/window-drag-events'

type WindowFrameState = {
  readonly active: boolean
  readonly activeSurface: Surface | null
  readonly surfaces: readonly Surface[]
  readonly window: WorkbenchWindow
}

type WindowFrameProps = {
  readonly rect: LayoutRect
  readonly surfaceRenderers: SurfaceRendererRegistry
  readonly windowId: WindowId
  readonly onDispatch: (operation: LayoutOperation) => void
}

type WindowPointerDrag = {
  readonly pointerId: number
  readonly startX: number
  readonly startY: number
  started: boolean
}

// Measured: surface-area rect/layout updates were repainting every window subtree.
export const WindowFrame = memo(function WindowFrame({
  rect,
  surfaceRenderers,
  windowId,
  onDispatch,
}: WindowFrameProps) {
  const windowDragRef = useRef<WindowPointerDrag | null>(null)
  const state = useLayoutState(
    (store) => selectWindowFrameState(store.layout, windowId),
    windowFrameStateEqual,
  )
  if (!state) return null

  const { active, activeSurface, surfaces, window } = state
  const collapsed = window.mode === 'collapsed'
  const fullSurface = window.mode === 'fullscreen' || window.mode === 'maximized'
  const windowCanCollapse = surfaces.every((surface) => surface.capabilities.canCollapse)
  const collapseLabel = collapsed
    ? `Expand ${activeSurface?.title ?? 'window'}`
    : `Collapse ${activeSurface?.title ?? 'window'}`
  const closeLabel = `Close ${activeSurface?.title ?? 'surface'}`

  function handleWindowDragPointerDown(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0) return
    if (windowDragBlockedTarget(event.target)) return

    windowDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      started: false,
    }
    setWindowPointerCapture(event.currentTarget, event.pointerId)
  }

  function handleWindowDragPointerMove(event: PointerEvent<HTMLElement>) {
    const drag = windowDragRef.current
    if (!windowDragMatchesEvent(drag, event)) return
    if (!primaryWindowPointerButtonIsDown(event)) {
      cancelWindowPointerDrag(event.currentTarget, drag)
      windowDragRef.current = null
      return
    }
    if (!drag.started && !windowDragMovedEnough(drag, event)) return

    event.preventDefault()
    drag.started = true
    dispatchWorkbenchWindowPointerDragEvent(WORKBENCH_WINDOW_POINTER_DRAG_EVENT, {
      clientX: event.clientX,
      clientY: event.clientY,
      windowId: window.id,
    })
  }

  function handleWindowDragPointerUp(event: PointerEvent<HTMLElement>) {
    const drag = windowDragRef.current
    if (!windowDragMatchesEvent(drag, event)) return

    releaseWindowPointerCapture(event.currentTarget, drag.pointerId)
    windowDragRef.current = null
    if (!drag.started) return

    dispatchWorkbenchWindowPointerDragEvent(WORKBENCH_WINDOW_POINTER_DROP_EVENT, {
      clientX: event.clientX,
      clientY: event.clientY,
      windowId: window.id,
    })
  }

  function handleWindowDragPointerCancel(event: PointerEvent<HTMLElement>) {
    const drag = windowDragRef.current
    if (!windowDragMatchesEvent(drag, event)) return

    releaseWindowPointerCapture(event.currentTarget, drag.pointerId)
    windowDragRef.current = null
    if (!drag.started) return

    dispatchWorkbenchWindowPointerCancelEvent()
  }

  function handleWindowFocus(event: FocusEvent<HTMLElement>) {
    if (focusCameFromToolSurface(event)) return

    activateWindow()
  }

  function handleWindowFocusPointerDown(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0) return

    activateWindow()
  }

  function activateWindow() {
    if (active) return
    if (!activeSurface) return

    onDispatch(selectWindowOperation(window))
  }

  return (
    <section
      aria-label={windowLabel({ activeSurface, window })}
      className={cn(
        'absolute isolate flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border bg-card/90 shadow-md ring-1 ring-border/30 backdrop-blur-md transition-[background-color,border-color,box-shadow]',
        active ? 'border-info/60 ring-info/30 shadow-lg' : 'border-border/70',
        collapsed && 'bg-card/80',
      )}
      data-active={active ? 'true' : 'false'}
      data-window-mode={window.mode}
      data-window-id={window.id}
      role='region'
      style={layoutRectStyle(rect)}
      tabIndex={0}
      onFocusCapture={handleWindowFocus}
      onPointerDownCapture={handleWindowFocusPointerDown}
    >
      <header
        className='border-border/70 bg-card/80 flex h-10 shrink-0 cursor-grab items-end gap-2 border-b pt-1 backdrop-blur-md active:cursor-grabbing'
        onLostPointerCapture={handleWindowDragPointerCancel}
        onPointerCancel={handleWindowDragPointerCancel}
        onPointerDown={handleWindowDragPointerDown}
        onPointerMove={handleWindowDragPointerMove}
        onPointerUp={handleWindowDragPointerUp}
      >
        <TabStrip surfaces={surfaces} window={window} onDispatch={onDispatch} />
        <div
          className='border-border/70 ml-1 flex h-8 shrink-0 items-center gap-0.5 pb-1 pl-1'
          data-window-drag-blocker=''
        >
          <WindowControlButton
            disabled={!windowCanCollapse}
            label={collapseLabel}
            onClick={() => {
              onDispatch({
                type: collapsed ? 'expandWindow' : 'collapseWindow',
                windowId: window.id,
              })
            }}
          >
            <MinusIcon className='size-3.5' />
          </WindowControlButton>
          <WindowControlButton
            label={fullSurface ? 'Restore window' : 'Maximize window'}
            onClick={() =>
              onDispatch({
                type: fullSurface ? 'restoreWindow' : 'maximizeWindow',
                windowId: window.id,
              })
            }
          >
            {fullSurface ? (
              <ArrowsInSimpleIcon className='size-3.5' />
            ) : (
              <ArrowsOutSimpleIcon className='size-3.5' />
            )}
          </WindowControlButton>
          <WindowControlButton
            disabled={!activeSurface?.capabilities.canClose}
            label={closeLabel}
            onClick={() => {
              if (activeSurface) {
                onDispatch({ surfaceId: activeSurface.id, type: 'closeSurface' })
              }
            }}
          >
            <XIcon className='size-3.5' />
          </WindowControlButton>
        </div>
      </header>
      <div
        className={cn(
          'bg-background/90 relative min-h-0 flex-1 overflow-hidden',
          collapsed && 'hidden',
        )}
      >
        {surfaces.map((surface) => {
          const visible = surface.id === window.activeSurfaceId

          return (
            <SurfaceHost
              active={active && visible}
              key={surface.id}
              surface={surface}
              surfaceRenderers={surfaceRenderers}
              visible={visible}
              windowId={window.id}
            />
          )
        })}
      </div>
    </section>
  )
}, windowFramePropsEqual)

function windowFramePropsEqual(left: WindowFrameProps, right: WindowFrameProps) {
  if (left.windowId !== right.windowId) return false
  if (left.surfaceRenderers !== right.surfaceRenderers) return false
  if (left.onDispatch !== right.onDispatch) return false

  return layoutRectsEqual(left.rect, right.rect)
}

function layoutRectsEqual(left: LayoutRect, right: LayoutRect) {
  if (left.height !== right.height) return false
  if (left.width !== right.width) return false
  if (left.x !== right.x) return false

  return left.y === right.y
}

function selectWindowFrameState(
  layout: WorkspaceLayout,
  windowId: WindowId,
): WindowFrameState | null {
  const window = layout.windowsById[windowId]
  if (!window) return null

  return {
    active: layout.activeWindowId === windowId,
    activeSurface: layout.surfacesById[window.activeSurfaceId] ?? null,
    surfaces: window.surfaceIds
      .map((surfaceId) => layout.surfacesById[surfaceId])
      .filter(isSurface),
    window,
  }
}

function windowFrameStateEqual(left: WindowFrameState | null, right: WindowFrameState | null) {
  if (left === right) return true
  if (!left || !right) return false
  if (left.active !== right.active) return false
  if (!surfacesAreEqual(left.activeSurface, right.activeSurface)) return false
  if (!windowsEqual(left.window, right.window)) return false

  return surfacesEqual(left.surfaces, right.surfaces)
}

function windowsEqual(left: WorkbenchWindow, right: WorkbenchWindow) {
  if (left === right) return true
  if (left.id !== right.id) return false
  if (left.mode !== right.mode) return false
  if (left.activeSurfaceId !== right.activeSurfaceId) return false

  return surfaceIdsEqual(left.surfaceIds, right.surfaceIds)
}

function surfacesEqual(left: readonly Surface[], right: readonly Surface[]) {
  if (left === right) return true
  if (left.length !== right.length) return false

  return left.every((surface, index) => surfacesAreEqual(surface, right[index] ?? null))
}

function surfaceIdsEqual(left: readonly string[], right: readonly string[]) {
  if (left === right) return true
  if (left.length !== right.length) return false

  return left.every((surfaceId, index) => surfaceId === right[index])
}

function isSurface(surface: Surface | undefined): surface is Surface {
  return Boolean(surface)
}

function selectWindowOperation(window: WorkbenchWindow): LayoutOperation {
  return {
    surfaceId: window.activeSurfaceId,
    type: 'activateSurface',
    windowId: window.id,
  }
}

function focusCameFromToolSurface(event: FocusEvent<HTMLElement>) {
  const surfaceType = focusedSurfaceType(event.target)
  if (!surfaceType) return false
  if (surfaceType === 'file-editor') return false

  return surfaceType !== 'diff'
}

function focusedSurfaceType(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return null

  const host = target.closest('[data-surface-host]')
  if (!(host instanceof HTMLElement)) return null

  return host.dataset.surfaceType ?? null
}

function windowDragBlockedTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false

  return Boolean(target.closest('[data-window-drag-blocker]'))
}

function windowDragMatchesEvent(
  drag: WindowPointerDrag | null,
  event: PointerEvent<HTMLElement>,
): drag is WindowPointerDrag {
  if (!drag) return false

  return drag.pointerId === event.pointerId
}

function windowDragMovedEnough(
  drag: WindowPointerDrag,
  event: Pick<PointerEvent<HTMLElement>, 'clientX' | 'clientY'>,
) {
  return (
    Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >=
    WORKBENCH_WINDOW_DRAG_START_THRESHOLD_PX
  )
}

function primaryWindowPointerButtonIsDown(event: Pick<PointerEvent<HTMLElement>, 'buttons'>) {
  return (event.buttons & 1) === 1
}

function cancelWindowPointerDrag(element: HTMLElement, drag: WindowPointerDrag) {
  releaseWindowPointerCapture(element, drag.pointerId)
  if (!drag.started) return

  dispatchWorkbenchWindowPointerCancelEvent()
}

function setWindowPointerCapture(element: HTMLElement, pointerId: number) {
  if (!element.isConnected) return
  if (!element.setPointerCapture) return

  try {
    element.setPointerCapture(pointerId)
  } catch {
    // Synthetic browser-test pointer events may not register an active pointer.
  }
}

function releaseWindowPointerCapture(element: HTMLElement, pointerId: number) {
  if (!element.isConnected) return
  if (!element.releasePointerCapture) return

  try {
    if (element.hasPointerCapture && !element.hasPointerCapture(pointerId)) return

    element.releasePointerCapture(pointerId)
  } catch {
    // Ignore stale pointer capture after browser-level cancellation.
  }
}

function windowLabel({
  activeSurface,
  window,
}: {
  readonly activeSurface: Surface | null
  readonly window: WorkbenchWindow
}) {
  if (activeSurface) return `Window: ${activeSurface.title}`

  return `Window ${window.id}`
}
