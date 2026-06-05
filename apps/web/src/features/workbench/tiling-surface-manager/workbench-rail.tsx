import { cn } from '@workspace/ui/lib/utils'

import {
  railSurfaceWindowId,
  selectWorkbenchRailSurfaceItems,
  type WorkbenchRailSurfaceItem,
} from './workbench-rail-model'
import { WorkbenchSurfaceIcon } from './workbench-surface-icon'
import type { LayoutOperation, WorkspaceLayout } from './layout-types'

export function WorkbenchRail({
  layout,
  onDispatch,
}: {
  readonly layout: WorkspaceLayout
  readonly onDispatch: (operation: LayoutOperation) => void
}) {
  const items = selectWorkbenchRailSurfaceItems(layout)
  if (items.length === 0) return null

  return (
    <nav
      aria-label='Workbench rail'
      className='border-border/80 bg-background/95 absolute top-3 right-3 z-50 flex max-w-[calc(100%-24px)] items-center gap-1 rounded-md border p-1 shadow-sm backdrop-blur-sm'
      data-workbench-rail=''
    >
      {items.map((item) => (
        <button
          aria-label={railItemLabel(item)}
          className={cn(
            'text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring/60 flex size-8 items-center justify-center rounded-md outline-none transition-colors focus-visible:ring-1',
            item.state === 'active' && 'bg-accent text-accent-foreground',
          )}
          data-rail-state={item.state}
          data-rail-surface-id={item.surface.id}
          key={item.surface.id}
          title={railItemLabel(item)}
          type='button'
          onClick={() => onDispatch(railItemOperation(layout, item))}
        >
          <WorkbenchSurfaceIcon className='size-4' type={item.surface.type} />
        </button>
      ))}
    </nav>
  )
}

function railItemOperation(
  layout: WorkspaceLayout,
  item: WorkbenchRailSurfaceItem,
): LayoutOperation {
  const windowId = railSurfaceWindowId(layout, item.surface.id)
  if (windowId) {
    return {
      surfaceId: item.surface.id,
      targetWindowId: windowId,
      type: 'tabSurface',
    }
  }

  return {
    surfaceId: item.surface.id,
    type: 'restoreSurface',
  }
}

function railItemLabel(item: WorkbenchRailSurfaceItem) {
  if (item.state === 'minimized') return `Restore ${item.surface.title}`
  if (item.state === 'active') return `${item.surface.title} active`

  return `Focus ${item.surface.title}`
}
