import { arraysEqual } from '@/lib/arrays'
import { useLayoutState } from '@/features/workbench/hooks/use-layout-state'
import { HiddenSurfaceHosts } from '@/features/workbench/components/hidden-surface-hosts'
import { selectHiddenMountedSurfaces } from '@/features/workbench/utils/hidden-surfaces'
import type { SurfaceRendererRegistry } from '@/features/workbench/utils/surface-renderer-registry'

export function LayoutHiddenSurfaceHosts({
  surfaceRenderers,
}: {
  readonly surfaceRenderers: SurfaceRendererRegistry
}) {
  const surfaces = useLayoutState((state) => selectHiddenMountedSurfaces(state.layout), arraysEqual)

  return <HiddenSurfaceHosts surfaces={surfaces} surfaceRenderers={surfaceRenderers} />
}
