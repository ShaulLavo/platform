import { cn } from '@workspace/ui/lib/utils'

import {
  isWorkbenchRailBottomPaneItem,
  isWorkbenchRailSurfaceItem,
  railItemOperation,
  type WorkbenchRailItem,
} from '@/features/tiling-surface-manager/engine/rail-model'
import { SurfaceIcon } from '@/features/workbench/components/surface-icon'
import {
  layoutSnapshot,
  logWorkbenchLayoutInfo,
  operationSummary,
} from '@/features/tiling-surface-manager/engine/layout-logging'
import type {
  LayoutOperation,
  WorkspaceLayout,
} from '@/features/tiling-surface-manager/engine/layout-types'

export function Rail({
  getLayout,
  items,
  onDispatch,
}: {
  readonly getLayout: () => WorkspaceLayout
  readonly items: readonly WorkbenchRailItem[]
  readonly onDispatch: (operation: LayoutOperation) => void
}) {
  if (items.length === 0) return null

  return (
    <nav
      aria-label='Workbench rail'
      className='bg-card relative z-10 flex w-11 shrink-0 flex-col items-center gap-1 border-r border-transparent p-1 backdrop-blur-md'
      data-workbench-rail=''
    >
      {items.map((item) => (
        <button
          aria-label={railItemLabel(item)}
          className={cn(
            'text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring/60 flex size-8 items-center justify-center rounded-md outline-none transition-colors focus-visible:ring-1',
            item.state === 'active' && 'bg-accent text-accent-foreground',
            item.state === 'visible' && 'bg-muted text-foreground',
          )}
          data-rail-state={item.state}
          data-rail-surface-id={railItemSurfaceId(item)}
          data-rail-pane-id={railItemPaneId(item)}
          key={railItemKey(item)}
          title={railItemLabel(item)}
          type='button'
          onClick={() => dispatchRailItemOperation(getLayout(), item, onDispatch)}
        >
          <SurfaceIcon className='size-4' type={railItemSurfaceType(item)} />
        </button>
      ))}
    </nav>
  )
}

function dispatchRailItemOperation(
  layout: WorkspaceLayout,
  item: WorkbenchRailItem,
  onDispatch: (operation: LayoutOperation) => void,
) {
  const operation = railItemOperation(layout, item)
  logWorkbenchLayoutInfo('rail.item.click', {
    layout: layoutSnapshot(layout),
    operation: operationSummary(operation),
    railState: item.state,
    railItemId: railItemKey(item),
    surfaceId: railItemSurfaceId(item),
    surfaceTitle: railItemTitle(item),
    surfaceType: railItemSurfaceType(item),
  })
  onDispatch(operation)
}

function railItemLabel(item: WorkbenchRailItem) {
  if (isWorkbenchRailBottomPaneItem(item)) return bottomPaneRailItemLabel(item)
  if (!isWorkbenchRailSurfaceItem(item)) return item.recipe.title

  if (item.state === 'background') return `Restore ${item.surface.title}`
  if (item.state === 'collapsed') return `Expand ${item.surface.title}`
  if (paneIsVisible(item) && item.surface.capabilities.canCollapse) {
    return `Collapse ${item.surface.title}`
  }
  if (item.state === 'active') return `${item.surface.title} active`
  if (item.state === 'visible') return `Focus ${item.surface.title}`

  return `Focus ${item.surface.title}`
}

function bottomPaneRailItemLabel(item: WorkbenchRailItem) {
  if (item.state === 'collapsed') return 'Close Terminal'
  if (paneIsVisible(item)) return 'Close Terminal'
  if (item.state === 'running' || item.state === 'background') return 'Restore Terminal'

  return 'Open Terminal'
}

function paneIsVisible(item: WorkbenchRailItem) {
  return item.state === 'active' || item.state === 'visible'
}

function railItemKey(item: WorkbenchRailItem) {
  if (isWorkbenchRailBottomPaneItem(item)) return item.id
  if (isWorkbenchRailSurfaceItem(item)) return item.surface.id

  return item.recipe.id
}

function railItemPaneId(item: WorkbenchRailItem) {
  if (isWorkbenchRailBottomPaneItem(item)) return item.id

  return undefined
}

function railItemSurfaceId(item: WorkbenchRailItem) {
  if (isWorkbenchRailSurfaceItem(item)) return item.surface.id

  return undefined
}

function railItemTitle(item: WorkbenchRailItem) {
  if (isWorkbenchRailBottomPaneItem(item)) return item.title
  if (isWorkbenchRailSurfaceItem(item)) return item.surface.title

  return item.recipe.title
}

function railItemSurfaceType(item: WorkbenchRailItem) {
  if (isWorkbenchRailBottomPaneItem(item)) return 'terminal'
  if (isWorkbenchRailSurfaceItem(item)) return item.surface.type

  return 'placeholder'
}
