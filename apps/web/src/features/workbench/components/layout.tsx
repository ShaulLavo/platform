import { cn } from '@workspace/ui/lib/utils'

import { LayoutRail } from '@/features/workbench/components/layout-rail'
import { SurfaceArea } from '@/features/workbench/components/surface-area'
import { Wallpaper } from '@/features/workbench/components/wallpaper'
import { useLayoutState } from '@/features/workbench/hooks/use-layout-state'
import type { SurfaceRendererRegistry } from '@/features/workbench/utils/surface-renderer-registry'

export function WorkbenchLayout({
  className,
  surfaceRenderers,
}: {
  readonly className?: string
  readonly surfaceRenderers: SurfaceRendererRegistry
}) {
  const dispatchLayoutOperation = useLayoutState((state) => state.dispatchLayoutOperation)

  return (
    <div
      aria-label='Workbench layout'
      className={cn(
        'bg-background text-foreground relative isolate flex h-full min-h-0 min-w-0 overflow-hidden',
        className,
      )}
      data-workbench-layout=''
      role='application'
    >
      <Wallpaper />
      <LayoutRail onDispatch={dispatchLayoutOperation} />
      <SurfaceArea surfaceRenderers={surfaceRenderers} />
    </div>
  )
}
