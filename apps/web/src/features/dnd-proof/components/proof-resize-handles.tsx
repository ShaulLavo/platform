import type { ResizeHandleLayoutRect } from '@/features/tiling-surface-manager/engine/layout-geometry'
import { layoutRectStyle } from '@/features/workbench/utils/layout-style'
import { cn } from '@workspace/ui/lib/utils'

export function ProofResizeHandles({
  resizeHandleRects,
}: {
  readonly resizeHandleRects: readonly ResizeHandleLayoutRect[]
}) {
  return (
    <>
      {resizeHandleRects.map((handle) => (
        <div
          aria-hidden='true'
          className={cn(
            'pointer-events-none absolute z-20 bg-border/60',
            handle.axis === 'horizontal' ? 'cursor-col-resize' : 'cursor-row-resize',
          )}
          data-proof-resize-handle={handle.id}
          key={handle.id}
          style={layoutRectStyle(handle.rect)}
        />
      ))}
    </>
  )
}
