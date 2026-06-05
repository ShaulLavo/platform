import { WorkbenchSurfaceHost } from './workbench-surface-host'
import { visibleSurfaceIdsInOrder } from './layout-normalize'
import type { WorkbenchSurfaceRendererRegistry } from './surface-renderer-registry'
import type { Surface, WorkspaceLayout } from './layout-types'

export function WorkbenchHiddenSurfaceHosts({
  layout,
  surfaceRenderers,
}: {
  readonly layout: WorkspaceLayout
  readonly surfaceRenderers: WorkbenchSurfaceRendererRegistry
}) {
  const surfaces = hiddenMountedSurfaces(layout)
  if (surfaces.length === 0) return null

  return (
    <div aria-hidden='true' className='hidden' data-workbench-hidden-surface-hosts=''>
      {surfaces.map((surface) => (
        <WorkbenchSurfaceHost
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
