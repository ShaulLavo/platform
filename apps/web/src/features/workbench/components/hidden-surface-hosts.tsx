import { SurfaceHost } from '@/features/workbench/components/surface-host'
import { visibleSurfaceIdsInOrder } from '@/features/tiling-surface-manager/utils/layout-normalize'
import type { SurfaceRendererRegistry } from '@/features/workbench/utils/surface-renderer-registry'
import type { Surface, WorkspaceLayout } from '@/features/tiling-surface-manager/utils/layout-types'

export function HiddenSurfaceHosts({
  layout,
  surfaceRenderers,
}: {
  readonly layout: WorkspaceLayout
  readonly surfaceRenderers: SurfaceRendererRegistry
}) {
  const surfaces = hiddenMountedSurfaces(layout)
  if (surfaces.length === 0) return null

  return (
    <div aria-hidden='true' className='hidden' data-workbench-hidden-surface-hosts=''>
      {surfaces.map((surface) => (
        <SurfaceHost
          active={false}
          key={surface.id}
          surface={surface}
          surfaceRenderers={surfaceRenderers}
          visible={false}
        />
      ))}
    </div>
  )
}

function hiddenMountedSurfaces(layout: WorkspaceLayout): readonly Surface[] {
  const hiddenSurfaceIds = new Set([
    ...layout.rail.minimizedSurfaceIds,
    ...layout.rail.runningSurfaceIds,
  ])
  const visibleSurfaceIds = new Set(visibleSurfaceIdsInOrder(layout))

  return Array.from(hiddenSurfaceIds)
    .filter((surfaceId) => !visibleSurfaceIds.has(surfaceId))
    .map((surfaceId) => layout.surfacesById[surfaceId])
    .filter(isKeepMountedSurface)
}

function isKeepMountedSurface(surface: Surface | undefined): surface is Surface {
  return surface?.rendererLifecycle === 'keep-mounted'
}
