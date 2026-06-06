import { WindowFrame } from '@/features/workbench/components/window-frame'
import type {
  LayoutRect,
  WindowLayoutRect,
} from '@/features/tiling-surface-manager/engine/layout-geometry'
import type {
  LayoutOperation,
  WindowId,
} from '@/features/tiling-surface-manager/engine/layout-types'
import type { MaterializedLayoutNode } from '@/features/tiling-surface-manager/engine/layout-selectors'
import type { SurfaceRendererRegistry } from '@/features/workbench/utils/surface-renderer-registry'

export function SplitNode({
  activeWindowId,
  maximizedRect,
  maximizedWindowId,
  node,
  surfaceRenderers,
  windowRectsById,
  onDispatch,
}: {
  readonly activeWindowId?: WindowId
  readonly maximizedRect: LayoutRect
  readonly maximizedWindowId?: WindowId
  readonly node: MaterializedLayoutNode
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
        active={activeWindowId === node.windowId}
        node={node}
        rect={rect}
        surfaceRenderers={surfaceRenderers}
        onDispatch={onDispatch}
      />
    )
  }

  return (
    <>
      {node.children.map((child) => (
        <SplitNode
          activeWindowId={activeWindowId}
          key={child.id}
          maximizedRect={maximizedRect}
          maximizedWindowId={maximizedWindowId}
          node={child}
          surfaceRenderers={surfaceRenderers}
          windowRectsById={windowRectsById}
          onDispatch={onDispatch}
        />
      ))}
    </>
  )
}
