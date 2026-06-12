import { useState } from 'react'

import {
  deriveLayoutGeometry,
  insetLayoutRect,
  type LayoutGeometryOptions,
  type LayoutRect,
} from '@workspace/tiling/utils/layout-geometry'
import { selectMaterializedLayoutTree } from '@workspace/tiling/utils/layout-selectors'
import { useLayoutRootRect } from '@/features/workbench/hooks/use-layout-root-rect'
import { useLayoutState } from '@/features/workbench/hooks/use-layout-state'
import { WorkbenchDragDropProvider } from '@/features/workbench/providers/drag-drop-provider'
import { ResizeOverlay } from '@/features/workbench/components/resize-overlay'
import { SplitNode } from '@/features/workbench/components/split-node'
import type { SurfaceRendererRegistry } from '@/features/workbench/utils/surface-renderer-registry'
import { DEFAULT_LAYOUT_RECT } from '@/features/workbench/utils/layout-defaults'
import { fullSurfaceLayoutWindowId } from '@/features/workbench/utils/full-surface-window'
import { previewLayoutForOperation } from '@/features/workbench/utils/layout-preview'
import { surfaceAreaLayoutEqual } from '@/features/workbench/utils/layout-equality'
import type { LayoutOperation } from '@workspace/tiling/utils/layout-types'

export function SurfaceArea({
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
  const [previewOperation, setPreviewOperation] = useState<LayoutOperation | null>(null)
  const { rect, rootRef } = useLayoutRootRect(initialRect)
  const rootRect = rect ?? DEFAULT_LAYOUT_RECT
  const surfaceRect = insetLayoutRect(rootRect, geometryOptions.gapPx ?? 0)
  const geometry = deriveLayoutGeometry(layout, surfaceRect, geometryOptions)
  const previewLayout = previewLayoutForOperation(layout, previewOperation)
  const previewLayoutSnapshot = previewLayout === layout ? null : previewLayout
  const previewGeometry =
    previewLayout === layout
      ? geometry
      : deriveLayoutGeometry(previewLayout, surfaceRect, geometryOptions)
  const tree = selectMaterializedLayoutTree(previewLayout)
  const maximizedWindowId = fullSurfaceLayoutWindowId(previewLayout.windowsById)

  return (
    <div
      className='relative z-10 min-h-0 min-w-0 flex-1 overflow-hidden'
      data-workbench-surface-area=''
      ref={rootRef}
    >
      <WorkbenchDragDropProvider
        coordinateRootRef={rootRef}
        snapDestinationRects={geometry.snapDestinationRects}
        onDispatch={onDispatch}
        onPreview={setPreviewOperation}
      >
        {tree ? (
          <SplitNode
            maximizedRect={surfaceRect}
            maximizedWindowId={maximizedWindowId}
            node={tree}
            previewLayout={previewLayoutSnapshot}
            surfaceRenderers={surfaceRenderers}
            windowRectsById={previewGeometry.windowRectsById}
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
      </WorkbenchDragDropProvider>
    </div>
  )
}
