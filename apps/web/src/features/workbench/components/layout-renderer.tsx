import { cn } from '@workspace/ui/lib/utils'

import {
  deriveLayoutGeometry,
  insetLayoutRect,
  type LayoutGeometryOptions,
  type LayoutRect,
} from '@/features/tiling-surface-manager/engine/layout-geometry'
import { selectMaterializedLayoutTree } from '@/features/tiling-surface-manager/engine/layout-selectors'
import {
  selectWorkbenchRailSurfaceItems,
  type WorkbenchRailSurfaceItem,
} from '@/features/tiling-surface-manager/engine/rail-model'
import { useLayoutRootRect } from '@/features/workbench/hooks/use-layout-root-rect'
import { useLayoutStoreApi } from '@/features/workbench/hooks/use-layout-store-api'
import { useLayoutState } from '@/features/workbench/hooks/use-layout-state'
import { DropOverlay } from '@/features/workbench/components/drop-overlay'
import {
  HiddenSurfaceHosts,
  selectHiddenMountedSurfaces,
} from '@/features/workbench/components/hidden-surface-hosts'
import { Rail } from '@/features/workbench/components/rail'
import { ResizeOverlay } from '@/features/workbench/components/resize-overlay'
import { SplitNode } from '@/features/workbench/components/split-node'
import {
  defaultSurfaceRendererRegistry,
  type SurfaceRendererRegistry,
} from '@/features/workbench/utils/surface-renderer-registry'
import type {
  LayoutOperation,
  LayoutNode,
  Surface,
  WindowId,
  WorkbenchWindow,
  WorkspaceLayout,
} from '@/features/tiling-surface-manager/engine/layout-types'

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

export function LayoutRenderer({
  className,
  geometryOptions = DEFAULT_GEOMETRY_OPTIONS,
  initialRect = DEFAULT_LAYOUT_RECT,
  surfaceRenderers = defaultSurfaceRendererRegistry,
}: {
  readonly className?: string
  readonly geometryOptions?: LayoutGeometryOptions
  readonly initialRect?: LayoutRect | null
  readonly surfaceRenderers?: SurfaceRendererRegistry
}) {
  const dispatchLayoutOperation = useLayoutState((state) => state.dispatchLayoutOperation)

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
      <LayoutRendererRail onDispatch={dispatchLayoutOperation} />
      <LayoutRendererSurfaceArea
        geometryOptions={geometryOptions}
        initialRect={initialRect}
        surfaceRenderers={surfaceRenderers}
        onDispatch={dispatchLayoutOperation}
      />
      <LayoutRendererHiddenSurfaceHosts surfaceRenderers={surfaceRenderers} />
    </div>
  )
}

function LayoutRendererSurfaceArea({
  geometryOptions,
  initialRect,
  surfaceRenderers,
  onDispatch,
}: {
  readonly geometryOptions: LayoutGeometryOptions
  readonly initialRect: LayoutRect | null
  readonly surfaceRenderers: SurfaceRendererRegistry
  readonly onDispatch: (operation: LayoutOperation) => void
}) {
  const layout = useLayoutState((state) => state.layout, surfaceAreaLayoutEqual)
  const { rect, rootRef } = useLayoutRootRect(initialRect)
  const rootRect = rect ?? DEFAULT_LAYOUT_RECT
  const surfaceRect = insetLayoutRect(rootRect, geometryOptions.gapPx ?? 0)
  const geometry = deriveLayoutGeometry(layout, surfaceRect, geometryOptions)
  const tree = selectMaterializedLayoutTree(layout)
  const maximizedWindowId = maximizedLayoutWindowId(layout.windowsById)

  return (
    <div
      className='relative min-h-0 min-w-0 flex-1 overflow-hidden'
      data-workbench-surface-area=''
      ref={rootRef}
    >
      {tree ? (
        <SplitNode
          maximizedRect={surfaceRect}
          maximizedWindowId={maximizedWindowId}
          node={tree}
          surfaceRenderers={surfaceRenderers}
          windowRectsById={geometry.windowRectsById}
          onDispatch={onDispatch}
        />
      ) : (
        <div className='text-muted-foreground grid h-full place-items-center text-sm'>
          No surfaces
        </div>
      )}
      {maximizedWindowId ? null : (
        <ResizeOverlay resizeHandleRects={geometry.resizeHandleRects} onDispatch={onDispatch} />
      )}
      <DropOverlay dropZoneRects={geometry.dropZoneRects} />
    </div>
  )
}

function LayoutRendererRail({
  onDispatch,
}: {
  readonly onDispatch: (operation: LayoutOperation) => void
}) {
  const layoutStore = useLayoutStoreApi()
  const items = useLayoutState(
    (state) => selectWorkbenchRailSurfaceItems(state.layout),
    railItemsEqual,
  )

  return (
    <Rail getLayout={() => layoutStore.getState().layout} items={items} onDispatch={onDispatch} />
  )
}

function LayoutRendererHiddenSurfaceHosts({
  surfaceRenderers,
}: {
  readonly surfaceRenderers: SurfaceRendererRegistry
}) {
  const surfaces = useLayoutState(
    (state) => selectHiddenMountedSurfaces(state.layout),
    surfacesEqual,
  )

  return <HiddenSurfaceHosts surfaces={surfaces} surfaceRenderers={surfaceRenderers} />
}

function maximizedLayoutWindowId(
  windowsById: Readonly<Record<WindowId, WorkbenchWindow>>,
): WindowId | undefined {
  return Object.values(windowsById).find((window) => window.mode === 'maximized')?.id
}

export function surfaceAreaLayoutEqual(left: WorkspaceLayout, right: WorkspaceLayout) {
  if (left === right) return true
  if (!layoutTreeGeometryEqual(left, right)) return false

  return layoutWindowsGeometryEqual(left.windowsById, right.windowsById)
}

function layoutTreeGeometryEqual(left: WorkspaceLayout, right: WorkspaceLayout): boolean {
  return layoutNodeGeometryEqual(left, right, layoutRootNode(left), layoutRootNode(right))
}

function layoutRootNode(layout: WorkspaceLayout) {
  if (!layout.rootNodeId) return undefined

  return layout.nodesById[layout.rootNodeId]
}

function layoutNodeGeometryEqual(
  leftLayout: WorkspaceLayout,
  rightLayout: WorkspaceLayout,
  leftNode: LayoutNode | undefined,
  rightNode: LayoutNode | undefined,
): boolean {
  if (leftNode === rightNode) return true
  if (!leftNode || !rightNode) return false
  if (leftNode.kind !== rightNode.kind) return false
  if (leftNode.kind === 'window') {
    return rightNode.kind === 'window' && leftNode.windowId === rightNode.windowId
  }
  if (rightNode.kind !== 'split') return false
  if (leftNode.axis !== rightNode.axis) return false
  if (!numberArraysEqual(leftNode.sizes, rightNode.sizes)) return false

  return layoutNodeChildrenGeometryEqual(leftLayout, rightLayout, leftNode, rightNode)
}

function layoutNodeChildrenGeometryEqual(
  leftLayout: WorkspaceLayout,
  rightLayout: WorkspaceLayout,
  leftNode: Extract<LayoutNode, { kind: 'split' }>,
  rightNode: Extract<LayoutNode, { kind: 'split' }>,
): boolean {
  if (leftNode.childIds.length !== rightNode.childIds.length) return false

  return leftNode.childIds.every((leftChildId, index) => {
    const rightChildId = rightNode.childIds[index]
    if (!rightChildId) return false

    return layoutNodeGeometryEqual(
      leftLayout,
      rightLayout,
      leftLayout.nodesById[leftChildId],
      rightLayout.nodesById[rightChildId],
    )
  })
}

function layoutWindowsGeometryEqual(
  left: Readonly<Record<WindowId, WorkbenchWindow>>,
  right: Readonly<Record<WindowId, WorkbenchWindow>>,
) {
  const leftWindowIds = Object.keys(left)
  const rightWindowIds = Object.keys(right)
  if (leftWindowIds.length !== rightWindowIds.length) return false

  return leftWindowIds.every((windowId) =>
    layoutWindowGeometryEqual(left[windowId as WindowId], right[windowId as WindowId]),
  )
}

function layoutWindowGeometryEqual(
  left: WorkbenchWindow | undefined,
  right: WorkbenchWindow | undefined,
) {
  if (left === right) return true
  if (!left || !right) return false

  return left.mode === right.mode
}

function railItemsEqual(
  left: readonly WorkbenchRailSurfaceItem[],
  right: readonly WorkbenchRailSurfaceItem[],
) {
  if (left === right) return true
  if (left.length !== right.length) return false

  return left.every((item, index) => railItemsAreEqual(item, right[index]))
}

function railItemsAreEqual(
  left: WorkbenchRailSurfaceItem,
  right: WorkbenchRailSurfaceItem | undefined,
) {
  if (!right) return false
  if (left.state !== right.state) return false

  return left.surface === right.surface
}

function surfacesEqual(left: readonly Surface[], right: readonly Surface[]) {
  if (left === right) return true
  if (left.length !== right.length) return false

  return left.every((surface, index) => surface === right[index])
}

function numberArraysEqual(left: readonly number[], right: readonly number[]) {
  if (left === right) return true
  if (left.length !== right.length) return false

  return left.every((value, index) => Object.is(value, right[index]))
}
