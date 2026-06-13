import { cn } from '@workspace/ui/lib/utils'

import type { LayoutGeometryOptions, LayoutRect } from '@workspace/tiling/utils/layout-geometry'
import { useLayoutState } from '@/features/workbench/hooks/use-layout-state'
import { LayoutHiddenSurfaceHosts } from '@/features/workbench/components/layout-hidden-surface-hosts'
import { LayoutRail } from '@/features/workbench/components/layout-rail'
import { SurfaceArea } from '@/features/workbench/components/surface-area'
import { Wallpaper } from '@/features/workbench/components/wallpaper'
import {
  defaultSurfaceRendererRegistry,
  type SurfaceRendererRegistry,
} from '@/features/workbench/utils/surface-renderer-registry'
import {
  DEFAULT_GEOMETRY_OPTIONS,
  DEFAULT_LAYOUT_RECT,
} from '@/features/workbench/utils/layout-defaults'

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
        'bg-background text-foreground relative isolate flex h-full min-h-0 min-w-0 overflow-hidden',
        className,
      )}
      data-workbench-layout-renderer=''
      role='application'
    >
      <Wallpaper />
      <LayoutRail onDispatch={dispatchLayoutOperation} />
      <SurfaceArea
        geometryOptions={geometryOptions}
        initialRect={initialRect}
        surfaceRenderers={surfaceRenderers}
        onDispatch={dispatchLayoutOperation}
      />
      <LayoutHiddenSurfaceHosts surfaceRenderers={surfaceRenderers} />
    </div>
  )
}
