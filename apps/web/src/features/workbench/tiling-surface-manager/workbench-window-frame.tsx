import { ArrowsInSimpleIcon, ArrowsOutSimpleIcon, MinusIcon, XIcon } from '@phosphor-icons/react'
import { cn } from '@workspace/ui/lib/utils'

import { WorkbenchSurfaceHost } from './workbench-surface-host'
import { WorkbenchTabStrip } from './workbench-tab-strip'
import { WorkbenchWindowControlButton } from './workbench-window-control-button'
import { layoutRectStyle } from './workbench-layout-style'
import type { LayoutRect } from './layout-geometry'
import type { LayoutOperation } from './layout-types'
import type { MaterializedWindowNode } from './layout-selectors'
import type { WorkbenchSurfaceRendererRegistry } from './surface-renderer-registry'

export function WorkbenchWindowFrame({
  active,
  node,
  rect,
  surfaceRenderers,
  onDispatch,
}: {
  readonly active: boolean
  readonly node: MaterializedWindowNode
  readonly rect: LayoutRect
  readonly surfaceRenderers: WorkbenchSurfaceRendererRegistry
  readonly onDispatch: (operation: LayoutOperation) => void
}) {
  const window = node.window
  const activeSurface = node.activeSurface
  const maximized = window.mode === 'maximized'

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
        <WorkbenchTabStrip surfaces={node.surfaces} window={window} onDispatch={onDispatch} />
        <div className='flex h-8 shrink-0 items-center gap-0.5 pb-1'>
          <WorkbenchWindowControlButton
            disabled={!activeSurface?.capabilities.canMinimize}
            label={activeSurface ? `Minimize ${activeSurface.title}` : 'Minimize surface'}
            onClick={() => {
              if (activeSurface) {
                onDispatch({ surfaceId: activeSurface.id, type: 'minimizeSurface' })
              }
            }}
          >
            <MinusIcon className='size-3.5' />
          </WorkbenchWindowControlButton>
          <WorkbenchWindowControlButton
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
          </WorkbenchWindowControlButton>
          <WorkbenchWindowControlButton
            disabled={!activeSurface?.capabilities.canClose}
            label={activeSurface ? `Close ${activeSurface.title}` : 'Close surface'}
            onClick={() => {
              if (activeSurface) {
                onDispatch({ surfaceId: activeSurface.id, type: 'closeSurface' })
              }
            }}
          >
            <XIcon className='size-3.5' />
          </WorkbenchWindowControlButton>
        </div>
      </header>
      <div className='bg-background relative min-h-0 flex-1 overflow-hidden'>
        {node.surfaces.map((surface) => {
          const visible = surface.id === window.activeSurfaceId

          return (
            <WorkbenchSurfaceHost
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
