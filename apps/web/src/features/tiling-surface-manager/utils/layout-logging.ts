import { log } from '@/lib/client-logging'

import {
  visibleSurfaceIdsInOrder,
  visibleWindowIdsInOrder,
} from '@/features/tiling-surface-manager/utils/layout-normalize'
import type {
  DropDestination,
  LayoutNodeId,
  LayoutOperation,
  WorkspaceLayout,
} from '@/features/tiling-surface-manager/utils/layout-types'

type WorkbenchLayoutLogContext = Record<string, unknown>

export function logWorkbenchLayoutInfo(action: string, context: WorkbenchLayoutLogContext = {}) {
  log.info(workbenchLayoutLogEvent(action, context))
}

export function logWorkbenchLayoutWarn(action: string, context: WorkbenchLayoutLogContext = {}) {
  log.warn(workbenchLayoutLogEvent(action, context))
}

export function layoutSnapshot(layout: WorkspaceLayout) {
  return {
    activeSurfaceId: layout.activeSurfaceId,
    activeWindowId: layout.activeWindowId,
    minimizedSurfaceIds: layout.rail.minimizedSurfaceIds,
    nodeCount: Object.keys(layout.nodesById).length,
    rootNodeId: layout.rootNodeId,
    runningSurfaceIds: layout.rail.runningSurfaceIds,
    surfaceCount: Object.keys(layout.surfacesById).length,
    visibleSingletonSurfaceIds: layout.rail.visibleSingletonSurfaceIds,
    visibleSurfaceIds: visibleSurfaceIdsInOrder(layout),
    visibleWindowIds: visibleWindowIdsInOrder(layout),
    windowCount: Object.keys(layout.windowsById).length,
  }
}

export function visibleLayoutChanged(before: WorkspaceLayout, after: WorkspaceLayout) {
  return (
    stableStringify(visibleLayoutSnapshot(before)) !== stableStringify(visibleLayoutSnapshot(after))
  )
}

export function operationSummary(operation: LayoutOperation): WorkbenchLayoutLogContext {
  const base = { operationType: operation.type }

  switch (operation.type) {
    case 'activateSurface':
      return { ...base, surfaceId: operation.surfaceId, windowId: operation.windowId }
    case 'applyCustomWindowCommand':
      return {
        ...base,
        commandId: operation.command.id,
        commandTitle: operation.command.title,
        targetWindowId: operation.targetWindowId,
      }
    case 'applyLayoutCommand':
      return { ...base, commandId: operation.command.id, commandTitle: operation.command.title }
    case 'applyRecipe':
      return { ...base, recipeId: operation.recipeId }
    case 'closeSurface':
    case 'minimizeSurface':
    case 'restoreSurface':
      return { ...base, surfaceId: operation.surfaceId }
    case 'hideClassicBottomToolPane':
      return base
    case 'maximizeWindow':
    case 'restoreWindow':
      return { ...base, windowId: operation.windowId }
    case 'moveSurface':
      return {
        ...base,
        dropTarget: dropTargetSummary(operation.destination),
        surfaceId: operation.surfaceId,
      }
    case 'moveWindow':
      return {
        ...base,
        dropTarget: dropTargetSummary(operation.destination),
        windowId: operation.windowId,
      }
    case 'openSurface':
      return {
        ...base,
        policyId: operation.policyId,
        surfaceId: operation.surface.id,
        surfaceTitle: operation.surface.title,
        surfaceType: operation.surface.type,
      }
    case 'reorderSurface':
      return {
        ...base,
        fromIndex: operation.fromIndex,
        toIndex: operation.toIndex,
        windowId: operation.windowId,
      }
    case 'resizeSplit':
      return {
        ...base,
        deltaPx: operation.deltaPx,
        handleIndex: operation.handleIndex,
        splitId: operation.splitId,
      }
    case 'splitWindow':
      return {
        ...base,
        edge: operation.edge,
        sourceWindowId: operation.sourceWindowId,
        surfaceId: operation.surfaceId,
        windowId: operation.windowId,
      }
    case 'tabSurface':
      return {
        ...base,
        index: operation.index,
        surfaceId: operation.surfaceId,
        targetWindowId: operation.targetWindowId,
      }
    case 'toggleClassicBottomToolPane':
      return { ...base, target: operation.target }
  }
}

function workbenchLayoutLogEvent(action: string, context: WorkbenchLayoutLogContext) {
  return {
    action,
    area: 'workbench.layout',
    ...context,
  }
}

function visibleLayoutSnapshot(layout: WorkspaceLayout) {
  const visibleWindowIds = visibleWindowIdsInOrder(layout)

  return {
    activeSurfaceId: layout.activeSurfaceId,
    activeWindowId: layout.activeWindowId,
    nodes: visibleNodeSnapshots(layout, layout.rootNodeId),
    rootNodeId: layout.rootNodeId,
    windows: visibleWindowIds.map((windowId) => {
      const window = layout.windowsById[windowId]

      return {
        activeSurfaceId: window?.activeSurfaceId,
        id: windowId,
        mode: window?.mode,
        previewSurfaceId: window?.previewSurfaceId,
        surfaceIds: window?.surfaceIds ?? [],
      }
    }),
  }
}

function visibleNodeSnapshots(layout: WorkspaceLayout, nodeId: LayoutNodeId | null): unknown {
  if (!nodeId) return null

  const node = layout.nodesById[nodeId]
  if (!node) return null
  if (node.kind === 'window') return { id: node.id, kind: node.kind, windowId: node.windowId }

  return {
    axis: node.axis,
    childIds: node.childIds,
    children: node.childIds.map((childId) => visibleNodeSnapshots(layout, childId)),
    id: node.id,
    kind: node.kind,
    sizes: node.sizes,
  }
}

function stableStringify(value: unknown) {
  return JSON.stringify(value)
}

function dropTargetSummary(destination: DropDestination) {
  if (destination.kind === 'rail') return { kind: destination.kind }
  if (destination.kind === 'root-edge') {
    return { edge: destination.edge, kind: destination.kind }
  }
  if (destination.kind === 'parent-edge') {
    return { edge: destination.edge, kind: destination.kind, nodeId: destination.nodeId }
  }
  if (destination.kind === 'window-center') {
    return {
      kind: destination.kind,
      tabIndex: destination.tabIndex,
      windowId: destination.windowId,
    }
  }

  return { edge: destination.edge, kind: destination.kind, windowId: destination.windowId }
}
