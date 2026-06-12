import { visibleSurfaceIdsInOrder } from '@workspace/tiling/utils/layout-normalize'
import type { Surface, WorkspaceLayout } from '@workspace/tiling/utils/layout-types'

export function selectHiddenMountedSurfaces(layout: WorkspaceLayout): readonly Surface[] {
  const hiddenSurfaceIds = new Set([
    ...layout.rail.backgroundSurfaceIds,
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
