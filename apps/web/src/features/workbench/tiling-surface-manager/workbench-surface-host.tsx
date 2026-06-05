import { cn } from '@workspace/ui/lib/utils'

import {
  workbenchSurfaceRendererFor,
  type WorkbenchSurfaceRendererRegistry,
} from './surface-renderer-registry'
import type { Surface, WindowId } from './layout-types'

export function WorkbenchSurfaceHost({
  active,
  surface,
  surfaceRenderers,
  visible,
  windowId,
}: {
  readonly active: boolean
  readonly surface: Surface
  readonly surfaceRenderers: WorkbenchSurfaceRendererRegistry
  readonly visible: boolean
  readonly windowId?: WindowId
}) {
  if (!visible && surface.rendererLifecycle === 'unmount-when-hidden') return null

  const Renderer = workbenchSurfaceRendererFor(surfaceRenderers, surface.type)

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
}

export function surfacePanelId(surfaceId: Surface['id']) {
  return `workbench-surface-panel-${surfaceId}`
}
