import { ArrowsInSimpleIcon, ArrowsOutSimpleIcon, MinusIcon, XIcon } from '@phosphor-icons/react'
import { memo, type FocusEvent, type PointerEvent } from 'react'
import { useDraggable } from '@dnd-kit/react'
import { cn } from '@workspace/ui/lib/utils'

import { SurfaceHost } from '@/features/workbench/components/surface-host'
import { TabStrip } from '@/features/workbench/components/tab-strip'
import { WindowControlButton } from '@/features/workbench/components/window-control-button'
import {
  bottomPaneCloseWindowOperation,
  bottomPaneSurfaceVisibilityItems,
  isBottomPaneWindow,
  type BottomPaneSurfaceVisibilityItem,
} from '@workspace/tiling/utils/bottom-pane-model'
import { layoutRectStyle } from '@/features/workbench/utils/layout-style'
import { surfacesAreEqual } from '@/features/workbench/utils/surface-equality'
import type { LayoutRect } from '@workspace/tiling/utils/layout-geometry'
import type {
  LayoutOperation,
  Surface,
  WindowId,
  WorkbenchWindow,
  WorkspaceLayout,
} from '@workspace/tiling/utils/layout-types'
import type { SurfaceRendererRegistry } from '@/features/workbench/utils/surface-renderer-registry'
import { useLayoutState } from '@/features/workbench/hooks/use-layout-state'
import {
  WORKBENCH_WINDOW_DRAG_TYPE,
  type WorkbenchWindowDragData,
  workbenchWindowDragCapabilities,
  workbenchWindowDragId,
} from '@/features/workbench/utils/drag-drop-data'

type WindowFrameState = {
  readonly active: boolean
  readonly activeSurface: Surface | null
  readonly bottomPane: boolean
  readonly bottomPaneSurfaceVisibilityItems: readonly BottomPaneSurfaceVisibilityItem[]
  readonly surfaces: readonly Surface[]
  readonly window: WorkbenchWindow
}

type WindowFrameProps = {
  readonly previewLayout: WorkspaceLayout | null
  readonly rect: LayoutRect
  readonly surfaceRenderers: SurfaceRendererRegistry
  readonly windowId: WindowId
  readonly onDispatch: (operation: LayoutOperation) => void
}

// Measured: surface-area rect/layout updates were repainting every window subtree.
export const WindowFrame = memo(function WindowFrame({
  previewLayout,
  rect,
  surfaceRenderers,
  windowId,
  onDispatch,
}: WindowFrameProps) {
  const storeState = useLayoutState(
    (store) => selectWindowFrameState(store.layout, windowId),
    windowFrameStateEqual,
  )
  const previewState = previewLayout ? selectWindowFrameState(previewLayout, windowId) : null
  const state = previewState ?? storeState
  const windowDragCapabilities = state
    ? workbenchWindowDragCapabilities({ surfaces: state.surfaces, window: state.window })
    : { canDrag: false }
  const windowDrag = useDraggable<WorkbenchWindowDragData>({
    data: {
      capabilities: windowDragCapabilities,
      dragType: WORKBENCH_WINDOW_DRAG_TYPE,
      windowId: state?.window.id ?? windowId,
    },
    disabled: !windowDragCapabilities.canDrag,
    id: workbenchWindowDragId(state?.window.id ?? windowId),
  })
  if (!state) return null

  const { active, activeSurface, bottomPane, bottomPaneSurfaceVisibilityItems, surfaces, window } =
    state
  const collapsed = window.mode === 'collapsed'
  const fullSurface = window.mode === 'fullscreen' || window.mode === 'maximized'
  const windowCanCollapse = surfaces.every((surface) => surface.capabilities.canCollapse)
  const windowCanClose = bottomPane || Boolean(activeSurface?.capabilities.canClose)
  const collapseLabel = collapsed
    ? `Expand ${activeSurface?.title ?? 'window'}`
    : `Collapse ${activeSurface?.title ?? 'window'}`
  const closeLabel = `Close ${activeSurface?.title ?? 'surface'}`

  function setWindowElement(element: HTMLElement | null) {
    windowDrag.ref(element)
  }

  function setWindowHandle(element: HTMLElement | null) {
    windowDrag.handleRef(element)
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

  function closeWindow() {
    const operation = closeWindowOperation({ activeSurface, bottomPane, window })
    if (!operation) return

    onDispatch(operation)
  }

  return (
    <section
      aria-label={windowLabel({ activeSurface, window })}
      className='bg-card absolute isolate flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-transparent backdrop-blur-md transition-colors'
      data-active={active ? 'true' : 'false'}
      data-window-mode={window.mode}
      data-window-id={window.id}
      data-workbench-window-dragging={windowDrag.isDragging ? 'true' : undefined}
      ref={setWindowElement}
      role='region'
      style={layoutRectStyle(rect)}
      tabIndex={0}
      onFocusCapture={handleWindowFocus}
      onPointerDownCapture={handleWindowFocusPointerDown}
    >
      <header
        className='flex h-10 shrink-0 cursor-grab items-end gap-2 border-b border-transparent pt-1 active:cursor-grabbing'
        data-workbench-window-drag-handle=''
        ref={setWindowHandle}
      >
        <TabStrip
          bottomPaneSurfaceVisibilityItems={bottomPaneSurfaceVisibilityItems}
          surfaces={surfaces}
          window={window}
          onDispatch={onDispatch}
        />
        <div
          className='ml-1 flex h-8 shrink-0 items-center gap-0.5 pb-1 pl-1'
          data-workbench-drag-blocker=''
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
          <WindowControlButton disabled={!windowCanClose} label={closeLabel} onClick={closeWindow}>
            <XIcon className='size-3.5' />
          </WindowControlButton>
        </div>
      </header>
      <div className={cn('relative min-h-0 flex-1 overflow-hidden', collapsed && 'hidden')}>
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
  if (left.previewLayout !== right.previewLayout) return false
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
  const bottomPane = isBottomPaneWindow(layout, window)

  return {
    active: layout.activeWindowId === windowId,
    activeSurface: layout.surfacesById[window.activeSurfaceId] ?? null,
    bottomPane,
    bottomPaneSurfaceVisibilityItems: bottomPane
      ? bottomPaneSurfaceVisibilityItems(layout, windowId)
      : [],
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
  if (left.bottomPane !== right.bottomPane) return false
  if (
    !bottomPaneSurfaceVisibilityItemsEqual(
      left.bottomPaneSurfaceVisibilityItems,
      right.bottomPaneSurfaceVisibilityItems,
    )
  ) {
    return false
  }
  if (!windowsEqual(left.window, right.window)) return false

  return surfacesEqual(left.surfaces, right.surfaces)
}

function bottomPaneSurfaceVisibilityItemsEqual(
  left: readonly BottomPaneSurfaceVisibilityItem[],
  right: readonly BottomPaneSurfaceVisibilityItem[],
) {
  if (left === right) return true
  if (left.length !== right.length) return false

  return left.every((item, index) => bottomPaneSurfaceVisibilityItemEqual(item, right[index]))
}

function bottomPaneSurfaceVisibilityItemEqual(
  left: BottomPaneSurfaceVisibilityItem,
  right: BottomPaneSurfaceVisibilityItem | undefined,
) {
  if (!right) return false
  if (left.checked !== right.checked) return false
  if (left.disabled !== right.disabled) return false
  if (left.exists !== right.exists) return false

  return surfacesAreEqual(left.surface, right.surface)
}

function windowsEqual(left: WorkbenchWindow, right: WorkbenchWindow) {
  if (left === right) return true
  if (left.id !== right.id) return false
  if (left.mode !== right.mode) return false
  if (left.collapsedEdge !== right.collapsedEdge) return false
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

function closeWindowOperation({
  activeSurface,
  bottomPane,
  window,
}: {
  readonly activeSurface: Surface | null
  readonly bottomPane: boolean
  readonly window: WorkbenchWindow
}): LayoutOperation | null {
  if (bottomPane) return bottomPaneCloseWindowOperation(window.id)
  if (!activeSurface) return null

  return { surfaceId: activeSurface.id, type: 'closeSurface' }
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
