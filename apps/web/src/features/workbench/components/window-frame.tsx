import { ArrowsInSimpleIcon, ArrowsOutSimpleIcon, MinusIcon, XIcon } from '@phosphor-icons/react'
import { cn } from '@workspace/ui/lib/utils'

import { SurfaceHost } from '@/features/workbench/components/surface-host'
import { TabStrip } from '@/features/workbench/components/tab-strip'
import { WindowControlButton } from '@/features/workbench/components/window-control-button'
import { CLASSIC_DIAGNOSTICS_WINDOW_ID } from '@/features/tiling-surface-manager/engine/layout-builders'
import { layoutRectStyle } from '@/features/workbench/utils/layout-style'
import type { LayoutRect } from '@/features/tiling-surface-manager/engine/layout-geometry'
import type { LayoutOperation } from '@/features/tiling-surface-manager/engine/layout-types'
import type { MaterializedWindowNode } from '@/features/tiling-surface-manager/engine/layout-selectors'
import type { SurfaceRendererRegistry } from '@/features/workbench/utils/surface-renderer-registry'

export function WindowFrame({
  active,
  node,
  rect,
  surfaceRenderers,
  onDispatch,
}: {
  readonly active: boolean
  readonly node: MaterializedWindowNode
  readonly rect: LayoutRect
  readonly surfaceRenderers: SurfaceRendererRegistry
  readonly onDispatch: (operation: LayoutOperation) => void
}) {
  const window = node.window
  const activeSurface = node.activeSurface
  const collapsed = window.mode === 'collapsed'
  const maximized = window.mode === 'maximized'
  const classicBottomToolPane = window.id === CLASSIC_DIAGNOSTICS_WINDOW_ID
  const windowCanCollapse = node.surfaces.every((surface) => surface.capabilities.canCollapse)
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
      aria-label={windowLabel(node)}
      className={cn(
        'absolute isolate flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border bg-background/95 shadow-sm backdrop-blur-sm',
        active ? 'border-ring/45 shadow-black/10' : 'border-border/70',
      )}
      data-active={active ? 'true' : 'false'}
      data-window-id={window.id}
      role='region'
      style={layoutRectStyle(rect)}
      tabIndex={0}
      onFocusCapture={() => {
        if (!active && activeSurface) onDispatch(selectWindowOperation(node))
      }}
    >
      <header className='border-border/70 bg-background/85 flex h-10 shrink-0 items-end gap-2 border-b pt-1'>
        <TabStrip surfaces={node.surfaces} window={window} onDispatch={onDispatch} />
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
        {node.surfaces.map((surface) => {
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
}

function selectWindowOperation(node: MaterializedWindowNode): LayoutOperation {
  return {
    surfaceId: node.window.activeSurfaceId,
    type: 'activateSurface',
    windowId: node.window.id,
  }
}

function windowLabel(node: MaterializedWindowNode) {
  if (node.activeSurface) return `Window: ${node.activeSurface.title}`

  return `Window ${node.window.id}`
}
