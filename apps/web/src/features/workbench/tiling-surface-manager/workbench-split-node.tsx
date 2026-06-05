import { WorkbenchWindowFrame } from './workbench-window-frame'
import type { LayoutRect, WindowLayoutRect } from './layout-geometry'
import type { LayoutOperation, WindowId } from './layout-types'
import type { MaterializedLayoutNode } from './layout-selectors'
import type { WorkbenchSurfaceRendererRegistry } from './surface-renderer-registry'

export function WorkbenchSplitNode({
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
  readonly surfaceRenderers: WorkbenchSurfaceRendererRegistry
  readonly windowRectsById: Readonly<Record<string, WindowLayoutRect>>
  readonly onDispatch: (operation: LayoutOperation) => void
}) {
  if (node.kind === 'window') {
    if (maximizedWindowId && maximizedWindowId !== node.windowId) return null

    const rect = maximizedWindowId ? maximizedRect : windowRectsById[node.windowId]?.rect
    if (!rect) return null

    return (
      <WorkbenchWindowFrame
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
        <WorkbenchSplitNode
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
