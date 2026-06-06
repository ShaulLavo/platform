import { memo } from 'react'
import { cn } from '@workspace/ui/lib/utils'

import {
  surfaceRendererFor,
  type SurfaceRendererRegistry,
} from '@/features/workbench/utils/surface-renderer-registry'
import { surfacesAreEqual } from '@/features/workbench/utils/surface-equality'
import type { Surface, WindowId } from '@/features/tiling-surface-manager/engine/layout-types'

type SurfaceHostProps = {
  readonly active: boolean
  readonly surface: Surface
  readonly surfaceRenderers: SurfaceRendererRegistry
  readonly visible: boolean
  readonly windowId?: WindowId
}

// Measured: inactive tab closes were repainting unchanged editor surface hosts.
export const SurfaceHost = memo(function SurfaceHost({
  active,
  surface,
  surfaceRenderers,
  visible,
  windowId,
}: SurfaceHostProps) {
  if (!visible && surface.rendererLifecycle === 'unmount-when-not-expanded') return null

  const Renderer = surfaceRendererFor(surfaceRenderers, surface.type)

  return (
    <div
      aria-hidden={visible ? undefined : true}
      className={cn(
        'absolute inset-0 min-h-0 min-w-0 overflow-hidden',
        visible ? 'z-10 opacity-100' : 'pointer-events-none z-0 opacity-0',
      )}
      data-renderer-lifecycle={surface.rendererLifecycle}
      data-surface-host=''
      data-surface-id={surface.id}
      data-surface-type={surface.type}
      hidden={visible ? undefined : true}
      id={surfacePanelId(surface.id)}
      role={visible ? 'tabpanel' : undefined}
    >
      <Renderer active={active} surface={surface} visible={visible} windowId={windowId} />
    </div>
  )
}, surfaceHostPropsEqual)

function surfaceHostPropsEqual(left: SurfaceHostProps, right: SurfaceHostProps) {
  if (left.active !== right.active) return false
  if (left.visible !== right.visible) return false
  if (left.windowId !== right.windowId) return false
  if (left.surfaceRenderers !== right.surfaceRenderers) return false

  return surfacesAreEqual(left.surface, right.surface)
}

export function surfacePanelId(surfaceId: Surface['id']) {
  return `workbench-surface-panel-${surfaceId}`
}
