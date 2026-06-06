import { cn } from '@workspace/ui/lib/utils'

import {
  railSurfaceWindowId,
  selectWorkbenchRailSurfaceItems,
  type WorkbenchRailSurfaceItem,
} from './workbench-rail-model'
import { WorkbenchSurfaceIcon } from './workbench-surface-icon'
import { terminalSurfaceId } from './layout-ids'
import {
  layoutSnapshot,
  logWorkbenchLayoutInfo,
  operationSummary,
} from './workbench-layout-logging'
import type { LayoutOperation, WorkspaceLayout } from './layout-types'

const DEFAULT_TERMINAL_SURFACE_ID = terminalSurfaceId('terminal-1')

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
      className='border-border/80 bg-muted/30 flex w-11 shrink-0 flex-col items-center gap-1 border-r p-1'
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
          data-rail-surface-id={item.surface.id}
          key={item.surface.id}
          title={railItemLabel(item)}
          type='button'
          onClick={() => dispatchRailItemOperation(layout, item, onDispatch)}
        >
          <WorkbenchSurfaceIcon className='size-4' type={item.surface.type} />
        </button>
      ))}
    </nav>
  )
}

function dispatchRailItemOperation(
  layout: WorkspaceLayout,
  item: WorkbenchRailSurfaceItem,
  onDispatch: (operation: LayoutOperation) => void,
) {
  const operation = railItemOperation(layout, item)
  logWorkbenchLayoutInfo('rail.item.click', {
    layout: layoutSnapshot(layout),
    operation: operationSummary(operation),
    railState: item.state,
    surfaceId: item.surface.id,
    surfaceTitle: item.surface.title,
    surfaceType: item.surface.type,
  })
  onDispatch(operation)
}

export function railItemOperation(
  layout: WorkspaceLayout,
  item: WorkbenchRailSurfaceItem,
): LayoutOperation {
  const classicBottomTarget = classicBottomToolPaneTargetForRailItem(item)
  if (classicBottomTarget) {
    return {
      target: classicBottomTarget,
      type: 'toggleClassicBottomToolPane',
    }
  }

  if (!layout.surfacesById[item.surface.id]) {
    return {
      surface: item.surface,
      type: 'openSurface',
    }
  }

  const windowId = railSurfaceWindowId(layout, item.surface.id)
  if (windowId && item.surface.capabilities.canMinimize) {
    return {
      surfaceId: item.surface.id,
      type: 'minimizeSurface',
    }
  }

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
  if (item.surface.id === DEFAULT_TERMINAL_SURFACE_ID && paneIsVisible(item)) {
    return 'Hide bottom tool pane'
  }
  if (paneIsVisible(item) && item.surface.capabilities.canMinimize) {
    return `Minimize ${item.surface.title}`
  }
  if (item.state === 'active') return `${item.surface.title} active`
  if (item.state === 'visible') return `Focus ${item.surface.title}`

  return `Focus ${item.surface.title}`
}

function paneIsVisible(item: WorkbenchRailSurfaceItem) {
  return item.state === 'active' || item.state === 'visible'
}

function classicBottomToolPaneTargetForRailItem(item: WorkbenchRailSurfaceItem) {
  if (item.surface.id === DEFAULT_TERMINAL_SURFACE_ID) return 'terminal'

  return null
}
