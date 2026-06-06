import { cn } from '@workspace/ui/lib/utils'

import {
  deriveLayoutGeometry,
  insetLayoutRect,
  type LayoutGeometryOptions,
  type LayoutRect,
} from './layout-geometry'
import { selectMaterializedLayoutTree } from './layout-selectors'
import { useWorkbenchLayoutRootRect } from './use-workbench-layout-root-rect'
import { useWorkbenchLayoutState } from './use-workbench-layout-state'
import { WorkbenchDropOverlay } from './workbench-drop-overlay'
import { WorkbenchHiddenSurfaceHosts } from './workbench-hidden-surface-hosts'
import { WorkbenchRail } from './workbench-rail'
import { WorkbenchResizeOverlay } from './workbench-resize-overlay'
import { WorkbenchSplitNode } from './workbench-split-node'
import {
  defaultWorkbenchSurfaceRendererRegistry,
  type WorkbenchSurfaceRendererRegistry,
} from './surface-renderer-registry'
import type { WindowId, WorkbenchWindow } from './layout-types'

const DEFAULT_LAYOUT_RECT: LayoutRect = {
  height: 720,
  width: 1080,
  x: 0,
  y: 0,
}

const DEFAULT_GEOMETRY_OPTIONS: LayoutGeometryOptions = {
  gapPx: 8,
  resizeHandleThicknessPx: 8,
}

export function WorkbenchLayoutRenderer({
  className,
  geometryOptions = DEFAULT_GEOMETRY_OPTIONS,
  initialRect = DEFAULT_LAYOUT_RECT,
  surfaceRenderers = defaultWorkbenchSurfaceRendererRegistry,
}: {
  readonly className?: string
  readonly geometryOptions?: LayoutGeometryOptions
  readonly initialRect?: LayoutRect | null
  readonly surfaceRenderers?: WorkbenchSurfaceRendererRegistry
}) {
  const layout = useWorkbenchLayoutState((state) => state.layout)
  const dispatchLayoutOperation = useWorkbenchLayoutState((state) => state.dispatchLayoutOperation)
  const { rect, rootRef } = useWorkbenchLayoutRootRect(initialRect)
  const rootRect = rect ?? DEFAULT_LAYOUT_RECT
  const surfaceRect = insetLayoutRect(rootRect, geometryOptions.gapPx ?? 0)
  const geometry = deriveLayoutGeometry(layout, surfaceRect, geometryOptions)
  const tree = selectMaterializedLayoutTree(layout)
  const maximizedWindowId = maximizedLayoutWindowId(layout.windowsById)

  return (
    <div
      aria-label='Workbench layout'
      className={cn(
        'bg-background text-foreground flex h-full min-h-0 min-w-0 overflow-hidden',
        className,
      )}
      data-workbench-layout-renderer=''
      role='application'
    >
      <WorkbenchRail layout={layout} onDispatch={dispatchLayoutOperation} />
      <div
        className='relative min-h-0 min-w-0 flex-1 overflow-hidden'
        data-workbench-surface-area=''
        ref={rootRef}
      >
        {tree ? (
          <WorkbenchSplitNode
            activeWindowId={layout.activeWindowId}
            maximizedRect={surfaceRect}
            maximizedWindowId={maximizedWindowId}
            node={tree}
            surfaceRenderers={surfaceRenderers}
            windowRectsById={geometry.windowRectsById}
            onDispatch={dispatchLayoutOperation}
          />
        ) : (
          <div className='text-muted-foreground grid h-full place-items-center text-sm'>
            No surfaces
          </div>
        )}
        {maximizedWindowId ? null : (
          <WorkbenchResizeOverlay
            resizeHandleRects={geometry.resizeHandleRects}
            onDispatch={dispatchLayoutOperation}
          />
        )}
        <WorkbenchDropOverlay dropZoneRects={geometry.dropZoneRects} />
      </div>
      <WorkbenchHiddenSurfaceHosts layout={layout} surfaceRenderers={surfaceRenderers} />
    </div>
  )
}

function maximizedLayoutWindowId(
  windowsById: Readonly<Record<WindowId, WorkbenchWindow>>,
): WindowId | undefined {
  return Object.values(windowsById).find((window) => window.mode === 'maximized')?.id
}
