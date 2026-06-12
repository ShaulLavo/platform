import { SurfaceHost } from '@/features/workbench/components/surface-host'
import type { SurfaceRendererRegistry } from '@/features/workbench/utils/surface-renderer-registry'
import type { Surface } from '@workspace/tiling/utils/layout-types'

export function HiddenSurfaceHosts({
  surfaces,
  surfaceRenderers,
}: {
  readonly surfaces: readonly Surface[]
  readonly surfaceRenderers: SurfaceRendererRegistry
}) {
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
