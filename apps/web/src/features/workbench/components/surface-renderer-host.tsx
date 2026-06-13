import {
  surfaceRendererFor,
  type SurfaceRendererRegistry,
} from '@/features/workbench/utils/surface-renderer-registry'
import type { Surface, WindowId } from '@workspace/tiling/utils/layout-types'

// Renders the active surface's real widget edge-to-edge inside a window body.
// Only the active surface of a window is ever mounted: inactive tabs unmount and
// each widget rebuilds from its own persisted state (editor buffer/session,
// terminal server session), so there is no keep-alive host or cold-reveal here.
export function SurfaceRendererHost({
  active,
  surface,
  surfaceRenderers,
  windowId,
}: {
  readonly active: boolean
  readonly surface: Surface
  readonly surfaceRenderers: SurfaceRendererRegistry
  readonly windowId?: WindowId
}) {
  const Renderer = surfaceRendererFor(surfaceRenderers, surface.type)

  return (
    <div
      className='absolute inset-0 min-h-0 min-w-0 overflow-hidden'
      data-surface-host=''
      data-surface-id={surface.id}
      data-surface-type={surface.type}
      role='tabpanel'
    >
      {/* eslint-disable-next-line oxc-react-compiler/static-components -- Renderer is a stable component resolved from the surface registry, not one created during render. */}
      <Renderer active={active} surface={surface} visible windowId={windowId} />
    </div>
  )
}
