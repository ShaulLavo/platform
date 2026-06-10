import { WindowFrame } from '@/features/workbench/components/window-frame'
import type { LayoutRect, WindowLayoutRect } from '@workspace/tiling/utils/layout-geometry'
import type {
  LayoutOperation,
  WindowId,
  WorkspaceLayout,
} from '@workspace/tiling/utils/layout-types'
import type { MaterializedLayoutNode } from '@workspace/tiling/utils/layout-selectors'
import type { SurfaceRendererRegistry } from '@/features/workbench/utils/surface-renderer-registry'

export function SplitNode({
  maximizedRect,
  maximizedWindowId,
  node,
  previewLayout,
  surfaceRenderers,
  windowRectsById,
  onDispatch,
}: {
  readonly maximizedRect: LayoutRect
  readonly maximizedWindowId?: WindowId
  readonly node: MaterializedLayoutNode
  readonly previewLayout: WorkspaceLayout | null
  readonly surfaceRenderers: SurfaceRendererRegistry
  readonly windowRectsById: Readonly<Record<string, WindowLayoutRect>>
  readonly onDispatch: (operation: LayoutOperation) => void
}) {
  if (node.kind === 'window') {
    if (maximizedWindowId && maximizedWindowId !== node.windowId) return null

    const rect = maximizedWindowId ? maximizedRect : windowRectsById[node.windowId]?.rect
    if (!rect) return null

    return (
      <WindowFrame
        previewLayout={previewLayout}
        rect={rect}
        surfaceRenderers={surfaceRenderers}
        windowId={node.windowId}
        onDispatch={onDispatch}
      />
    )
  }

  return (
    <>
      {node.children.map((child) => (
        <SplitNode
          key={child.kind === 'window' ? child.windowId : child.id}
          maximizedRect={maximizedRect}
          maximizedWindowId={maximizedWindowId}
          node={child}
          previewLayout={previewLayout}
          surfaceRenderers={surfaceRenderers}
          windowRectsById={windowRectsById}
          onDispatch={onDispatch}
        />
      ))}
    </>
  )
}
