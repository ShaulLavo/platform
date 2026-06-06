import { ArrowsInSimpleIcon, ArrowsOutSimpleIcon, MinusIcon, XIcon } from '@phosphor-icons/react'
import { memo, type FocusEvent } from 'react'
import { cn } from '@workspace/ui/lib/utils'

import { SurfaceHost } from '@/features/workbench/components/surface-host'
import { TabStrip } from '@/features/workbench/components/tab-strip'
import { WindowControlButton } from '@/features/workbench/components/window-control-button'
import { CLASSIC_DIAGNOSTICS_WINDOW_ID } from '@/features/tiling-surface-manager/engine/layout-builders'
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

// Measured: surface-area rect/layout updates were repainting every window subtree.
export const WindowFrame = memo(function WindowFrame({
  rect,
  surfaceRenderers,
  windowId,
  onDispatch,
}: WindowFrameProps) {
  const state = useLayoutState(
    (store) => selectWindowFrameState(store.layout, windowId),
    windowFrameStateEqual,
  )
  if (!state) return null

  const { active, activeSurface, surfaces, window } = state
  const collapsed = window.mode === 'collapsed'
  const maximized = window.mode === 'maximized'
  const classicBottomToolPane = window.id === CLASSIC_DIAGNOSTICS_WINDOW_ID
  const windowCanCollapse = surfaces.every((surface) => surface.capabilities.canCollapse)
  let collapseLabel = collapsed ? 'Expand window' : 'Collapse window'
  let closeLabel = 'Close surface'

  if (classicBottomToolPane) {
    collapseLabel = 'Hide bottom tool pane'
    closeLabel = 'Close bottom tool pane'
  }

  if (!classicBottomToolPane && activeSurface) {
    collapseLabel = collapsed ? `Expand ${activeSurface.title}` : `Collapse ${activeSurface.title}`
    closeLabel = `Close ${activeSurface.title}`
  }

  return (
    <section
      aria-label={windowLabel({ activeSurface, window })}
      className={cn(
        'absolute isolate flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border bg-background/95 shadow-sm backdrop-blur-sm',
        active ? 'border-ring/45 shadow-black/10' : 'border-border/70',
      )}
      data-active={active ? 'true' : 'false'}
      data-window-id={window.id}
      role='region'
      style={layoutRectStyle(rect)}
      tabIndex={0}
      onFocusCapture={(event) => {
        if (focusCameFromToolSurface(event)) return
        if (active) return
        if (!activeSurface) return

        onDispatch(selectWindowOperation(window))
      }}
    >
      <header className='border-border/70 bg-background/85 flex h-10 shrink-0 items-end gap-2 border-b pt-1'>
        <TabStrip surfaces={surfaces} window={window} onDispatch={onDispatch} />
        <div className='border-border/70 ml-1 flex h-8 shrink-0 items-center gap-0.5 pb-1 pl-1'>
          <WindowControlButton
            disabled={!classicBottomToolPane && !windowCanCollapse}
            label={collapseLabel}
            onClick={() => {
              if (classicBottomToolPane) {
                onDispatch({ type: 'hideClassicBottomToolPane' })
                return
              }
              onDispatch({
                type: collapsed ? 'expandWindow' : 'collapseWindow',
                windowId: window.id,
              })
            }}
          >
            <MinusIcon className='size-3.5' />
          </WindowControlButton>
          <WindowControlButton
            label={maximized ? 'Restore window' : 'Maximize window'}
            onClick={() =>
              onDispatch({
                type: maximized ? 'restoreWindow' : 'maximizeWindow',
                windowId: window.id,
              })
            }
          >
            {maximized ? (
              <ArrowsInSimpleIcon className='size-3.5' />
            ) : (
              <ArrowsOutSimpleIcon className='size-3.5' />
            )}
          </WindowControlButton>
          <WindowControlButton
            disabled={!classicBottomToolPane && !activeSurface?.capabilities.canClose}
            label={closeLabel}
            onClick={() => {
              if (classicBottomToolPane) {
                onDispatch({ type: 'hideClassicBottomToolPane' })
                return
              }
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
          'bg-background relative min-h-0 flex-1 overflow-hidden',
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
