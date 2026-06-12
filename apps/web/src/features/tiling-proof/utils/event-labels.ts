import { windowTitle } from '@workspace/tiling/utils/layout-queries'
import type { TilingCommitEvent } from '@workspace/tiling/hooks/use-tiling-drag-controller'
import type {
  LayoutOperation,
  SnapDestination,
  WorkspaceLayout,
} from '@workspace/tiling/utils/layout-types'

export function destinationLabel(destination: SnapDestination): string {
  if (destination.kind === 'root-edge') return `root ${destination.edge}`
  if (destination.kind === 'window-edge') return `window ${destination.edge}`
  if (destination.kind === 'window-center') return 'merged tabs'
  if (destination.kind === 'parent-edge') return `parent ${destination.edge}`
  if (destination.kind === 'recipe-slot') return `slot ${destination.slot}`

  return destination.kind
}

export function windowMoveLabel(layout: WorkspaceLayout, destination: SnapDestination): string {
  if (destination.kind === 'window-center') {
    return `window -> merged tabs:${windowTitle(layout, destination.windowId)}`
  }

  return `window -> ${destinationLabel(destination)}`
}

export function commitEventLabel(layout: WorkspaceLayout, event: TilingCommitEvent): string {
  if (event.source.kind === 'tab') return tabCommitLabel(layout, event.target)

  return windowCommitLabel(layout, event.target)
}

export function layoutOperationLabel(layout: WorkspaceLayout, operation: LayoutOperation): string {
  if (operation.type === 'collapseWindow') {
    return `collapsed window: ${windowTitle(layout, operation.windowId)}`
  }
  if (operation.type === 'expandWindow') {
    return `expanded window: ${windowTitle(layout, operation.windowId)}`
  }
  if (operation.type === 'resizeSplit') return `resized split: ${operation.splitId}`

  return `operation: ${operation.type}`
}

function tabCommitLabel(layout: WorkspaceLayout, target: TilingCommitEvent['target']) {
  if (target.kind === 'tab') return `tab -> ${windowTitle(layout, target.windowId)}:${target.index}`
  if (target.kind === 'tab-strip') {
    return `tab -> ${windowTitle(layout, target.windowId)}:${target.index}`
  }
  if (target.kind === 'window') return `tab -> ${windowTitle(layout, target.windowId)}:end`

  return `tab -> ${destinationLabel(target.destination)}`
}

function windowCommitLabel(layout: WorkspaceLayout, target: TilingCommitEvent['target']) {
  if (target.kind === 'tab') return `window -> merged tabs:${windowTitle(layout, target.windowId)}`
  if (target.kind === 'tab-strip') {
    return `window -> merged tabs:${windowTitle(layout, target.windowId)}`
  }
  if (target.kind === 'window') return `window -> ${windowTitle(layout, target.windowId)}`

  return windowMoveLabel(layout, target.destination)
}
