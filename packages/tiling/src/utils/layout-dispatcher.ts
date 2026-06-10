import {
  applyCustomWindowCommand,
  applyHotkeyPreset,
  applyLayoutCommand,
  applyRecipe,
  fullscreenWindow,
  maximizeWindow,
  restoreWindow,
  upsertCustomWindowCommand,
  upsertLayoutCommand,
} from '@workspace/tiling/utils/frame-commands'
import {
  activateSurface,
  closeSurface,
  collapseWindow,
  expandWindow,
  moveSurface,
  moveWindow,
  openSurface,
  reorderSurface,
  restoreSurface,
  restoreSurfaces,
  splitWindow,
  tabSurface,
} from '@workspace/tiling/utils/layout-operations'
import { resizeSplit } from '@workspace/tiling/utils/resize'
import type { LayoutOperation, WorkspaceLayout } from '@workspace/tiling/utils/layout-types'

export function applyLayoutOperation(
  layout: WorkspaceLayout,
  operation: LayoutOperation,
): WorkspaceLayout {
  switch (operation.type) {
    case 'activateSurface':
      return activateSurface(layout, operation.surfaceId, operation.windowId)
    case 'openSurface':
      return openSurface(layout, operation.surface, { policyId: operation.policyId })
    case 'closeSurface':
      return closeSurface(layout, operation.surfaceId, { force: operation.force })
    case 'collapseWindow':
      return collapseWindow(layout, operation.windowId, operation.edge)
    case 'expandWindow':
      return expandWindow(layout, operation.windowId)
    case 'restoreSurface':
      return restoreSurface(layout, operation.surfaceId, operation.placement)
    case 'restoreSurfaces':
      return restoreSurfaces(
        layout,
        operation.surfaceIds,
        operation.activeSurfaceId,
        operation.placementsBySurfaceId,
      )
    case 'splitWindow':
      return splitWindow(layout, operation)
    case 'moveSurface':
      return moveSurface(layout, operation.surfaceId, operation.destination)
    case 'moveWindow':
      return moveWindow(layout, operation.windowId, operation.destination)
    case 'tabSurface':
      return tabSurface(layout, operation.surfaceId, operation.targetWindowId, operation.index)
    case 'reorderSurface':
      return reorderSurface(layout, operation.windowId, operation.fromIndex, operation.toIndex)
    case 'resizeSplit':
      return resizeSplit(
        layout,
        operation.splitId,
        operation.handleIndex,
        operation.deltaPx,
        operation.referencePx,
      )
    case 'fullscreenWindow':
      return fullscreenWindow(layout, operation.windowId)
    case 'maximizeWindow':
      return maximizeWindow(layout, operation.windowId)
    case 'restoreWindow':
      return restoreWindow(layout, operation.windowId)
    case 'applyRecipe':
      return applyRecipe(layout, operation.recipeId)
    case 'upsertCustomWindowCommand':
      return upsertCustomWindowCommand(layout, operation.command)
    case 'upsertLayoutCommand':
      return upsertLayoutCommand(layout, operation.command)
    case 'applyHotkeyPreset':
      return applyHotkeyPreset(layout, operation.preset)
    case 'applyCustomWindowCommand':
      return applyCustomWindowCommand(
        layout,
        operation.command,
        operation.targetWindowId,
        operation.nowMs,
      )
    case 'applyLayoutCommand':
      return applyLayoutCommand(layout, operation.command)
  }
}
