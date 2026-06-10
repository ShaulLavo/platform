import { createTilingInvariantError } from '@workspace/tiling/utils/structured-errors'
import { clampIndex } from '@workspace/tiling/utils/geometry-primitives'
import { layoutNodeId, workbenchWindowId } from '@workspace/tiling/utils/layout-ids'
import {
  surfaceCanUseDestination,
  windowCanTabIntoWindow,
} from '@workspace/tiling/utils/layout-capabilities'
import { placementForSurfaceWithPolicy } from '@workspace/tiling/utils/layout-policies'
import {
  policyForStickyPlacement,
  recipeSlotForSurface,
  stickyPlacementForSurface,
  surfaceCanClose,
  windowCanCollapse,
} from '@workspace/tiling/utils/layout-queries'
import {
  isToolPaneRecipeSlot,
  normalizeToolPaneRecipeLayout,
  placementCanRestoreSurface,
  visibleWindowIdForRecipeSlot,
  visibleWindowIdsForRecipeSlots,
  windowContainsRecipeSlot,
} from '@workspace/tiling/utils/recipe-packing'
import {
  edgeAxis,
  findNodeIdForWindow,
  findParentNodeId,
  findWindowIdContainingSurface,
  isLeadingEdge,
  isNodeDescendant,
  normalizeWorkspaceLayout,
  repairSplitSizes,
  visibleWindowIdsInOrder,
} from '@workspace/tiling/utils/layout-normalize'
import { layoutWithWindowMode } from '@workspace/tiling/utils/window-modes'
import type {
  LayoutEdge,
  SnapDestination,
  LayoutNode,
  LayoutNodeId,
  LayoutPolicyId,
  LayoutSplitNode,
  Surface,
  SurfaceId,
  SurfacePlacementHint,
  WorkspaceRecipeSlot,
  WindowId,
  WorkbenchWindow,
  WorkspaceLayout,
} from '@workspace/tiling/utils/layout-types'

export type OpenSurfaceOptions = {
  readonly policyId?: LayoutPolicyId
}

export type CloseSurfaceOptions = {
  readonly force?: boolean
}

export function activateSurface(
  layout: WorkspaceLayout,
  surfaceId: SurfaceId,
  windowId?: WindowId,
): WorkspaceLayout {
  const normalizedLayout = normalizeWorkspaceLayout(layout)
  const targetWindowId = windowId ?? findWindowIdContainingSurface(normalizedLayout, surfaceId)
  if (!targetWindowId) return normalizedLayout

  const window = normalizedLayout.windowsById[targetWindowId]
  if (!window?.surfaceIds.includes(surfaceId)) return normalizedLayout

  return normalizeWorkspaceLayout({
    ...normalizedLayout,
    activeSurfaceId: surfaceId,
    activeWindowId: targetWindowId,
    windowsById: {
      ...normalizedLayout.windowsById,
      [targetWindowId]: {
        ...window,
        activeSurfaceId: surfaceId,
      },
    },
  })
}

export function openSurface(
  layout: WorkspaceLayout,
  surface: Surface,
  options: OpenSurfaceOptions = {},
): WorkspaceLayout {
  const normalizedLayout = normalizeWorkspaceLayout(layout)
  const existingSurface = findExistingSurfaceForOpen(normalizedLayout, surface)
  const surfaceToOpen = surfaceForOpen(existingSurface, surface)
  const layoutWithSurface = upsertSurface(normalizedLayout, surfaceToOpen)
  const restoredLayout = removeSurfaceFromRail(layoutWithSurface, surfaceToOpen.id)
  const resolvedPlacement = placementForOpen(restoredLayout, surfaceToOpen, options.policyId)
  const placedLayout = placeSurface(
    resolvedPlacement.layout,
    surfaceToOpen.id,
    resolvedPlacement.placement,
  )

  return normalizeToolPaneRecipeLayout(normalizeWorkspaceLayout(placedLayout))
}

export function closeSurface(
  layout: WorkspaceLayout,
  surfaceId: SurfaceId,
  options: CloseSurfaceOptions = {},
): WorkspaceLayout {
  const normalizedLayout = normalizeWorkspaceLayout(layout)
  const surface = normalizedLayout.surfacesById[surfaceId]
  if (!surface) return normalizedLayout
  if (!options.force && !surfaceCanClose(surface)) return normalizedLayout

  const withoutSurface = deleteSurfaceFromLayout(normalizedLayout, surfaceId)

  return normalizeToolPaneRecipeLayout(normalizeWorkspaceLayout(withoutSurface))
}

function backgroundSurface(layout: WorkspaceLayout, surfaceId: SurfaceId): WorkspaceLayout {
  const normalizedLayout = normalizeWorkspaceLayout(layout)
  const surface = normalizedLayout.surfacesById[surfaceId]
  if (!surface?.capabilities.canCollapse) return normalizedLayout

  const withoutVisibleSurface = removeSurfaceFromWindows(normalizedLayout, surfaceId)
  const rail = addSurfaceToRail(withoutVisibleSurface, surfaceId, 'backgroundSurfaceIds').rail

  return normalizeToolPaneRecipeLayout(
    normalizeWorkspaceLayout({
      ...withoutVisibleSurface,
      rail,
    }),
  )
}

export function collapseWindow(
  layout: WorkspaceLayout,
  windowId: WindowId,
  edge?: LayoutEdge,
): WorkspaceLayout {
  const normalizedLayout = normalizeWorkspaceLayout(layout)
  const window = normalizedLayout.windowsById[windowId]
  if (!window) return normalizedLayout
  if (!windowCanCollapse(normalizedLayout, window)) return normalizedLayout

  const collapsedLayout = layoutWithCollapsedWindow(normalizedLayout, windowId, edge)

  return normalizeToolPaneRecipeLayout(normalizeWorkspaceLayout(collapsedLayout))
}

export function expandWindow(layout: WorkspaceLayout, windowId: WindowId): WorkspaceLayout {
  const normalizedLayout = normalizeWorkspaceLayout(layout)
  const window = normalizedLayout.windowsById[windowId]
  if (!window) return normalizedLayout

  const expandedLayout = layoutWithWindowMode(normalizedLayout, windowId, 'normal')

  return normalizeToolPaneRecipeLayout(
    normalizeWorkspaceLayout(activateWindow(expandedLayout, window)),
  )
}

function activateWindow(layout: WorkspaceLayout, window: WorkbenchWindow): WorkspaceLayout {
  return {
    ...layout,
    activeSurfaceId: window.activeSurfaceId,
    activeWindowId: window.id,
  }
}

export function restoreSurface(
  layout: WorkspaceLayout,
  surfaceId: SurfaceId,
  placement?: SurfacePlacementHint,
): WorkspaceLayout {
  const normalizedLayout = normalizeWorkspaceLayout(layout)
  const surface = normalizedLayout.surfacesById[surfaceId]
  if (!surface) return normalizedLayout

  const resolvedPlacement = placementForRestore(normalizedLayout, surface, placement)
  const restoredLayout = removeSurfaceFromRail(resolvedPlacement.layout, surfaceId)
  const placedLayout = placeSurface(restoredLayout, surfaceId, resolvedPlacement.placement)

  return normalizeToolPaneRecipeLayout(normalizeWorkspaceLayout(placedLayout))
}

export function restoreSurfaces(
  layout: WorkspaceLayout,
  surfaceIds: readonly SurfaceId[],
  activeSurfaceId?: SurfaceId,
  placementsBySurfaceId: Readonly<Record<string, SurfacePlacementHint>> = {},
): WorkspaceLayout {
  let nextLayout = normalizeWorkspaceLayout(layout)

  for (const surfaceId of surfaceIds) {
    nextLayout = restoreSurface(nextLayout, surfaceId, placementsBySurfaceId[surfaceId])
  }

  if (!activeSurfaceId) return nextLayout

  return activateSurface(nextLayout, activeSurfaceId)
}

type PlacementResolution = {
  readonly layout: WorkspaceLayout
  readonly placement: SurfacePlacementHint
}

type TabSurfaceInLayoutOptions = {
  readonly recordStickyPlacement?: boolean
}

function placementForRestore(
  layout: WorkspaceLayout,
  surface: Surface,
  placement?: SurfacePlacementHint,
): PlacementResolution {
  if (placement && placementCanRestoreSurface(layout, placement, surface)) {
    return { layout, placement }
  }

  const stickyPlacement = stickyPlacementForSurface(layout, surface.id)
  if (!stickyPlacement) return fallbackPlacementForRestore(layout, surface)
  if (placementCanRestoreSurface(layout, stickyPlacement, surface)) {
    return { layout, placement: stickyPlacement }
  }

  return fallbackPlacementForRestore(clearStickyPlacement(layout, surface.id), surface)
}

function fallbackPlacementForRestore(
  layout: WorkspaceLayout,
  surface: Surface,
): PlacementResolution {
  const placement = surface.placement
  if (placement && placementCanRestoreSurface(layout, placement)) {
    return { layout, placement }
  }

  return { layout, placement: { kind: 'recipe-slot', slot: recipeSlotForSurface(layout, surface) } }
}

export function splitWindow(
  layout: WorkspaceLayout,
  input: {
    readonly edge: LayoutEdge
    readonly sourceWindowId?: WindowId
    readonly surfaceId?: SurfaceId
    readonly windowId: WindowId
  },
): WorkspaceLayout {
  if (input.surfaceId) {
    return moveSurface(layout, input.surfaceId, {
      edge: input.edge,
      kind: 'window-edge',
      windowId: input.windowId,
    })
  }
  if (!input.sourceWindowId) return normalizeWorkspaceLayout(layout)

  return moveWindow(layout, input.sourceWindowId, {
    edge: input.edge,
    kind: 'window-edge',
    windowId: input.windowId,
  })
}

export function moveSurface(
  layout: WorkspaceLayout,
  surfaceId: SurfaceId,
  destination: SnapDestination,
): WorkspaceLayout {
  const normalizedLayout = normalizeWorkspaceLayout(layout)
  const surface = normalizedLayout.surfacesById[surfaceId]
  if (!surface) return normalizedLayout
  if (!surfaceCanUseDestination(normalizedLayout, surfaceId, destination)) return normalizedLayout
  if (destination.kind === 'background' || destination.kind === 'rail') {
    return backgroundSurface(normalizedLayout, surfaceId)
  }
  if (destination.kind === 'recipe-slot') {
    return moveSurface(
      normalizedLayout,
      surfaceId,
      destinationForRecipeSlotDrop(normalizedLayout, destination),
    )
  }
  if (destination.kind === 'window-center') {
    return tabSurface(normalizedLayout, surfaceId, destination.windowId, destination.tabIndex)
  }

  const movedAsWindowLayout = moveSingleSurfaceWindow(normalizedLayout, surfaceId, destination)
  if (movedAsWindowLayout) return movedAsWindowLayout

  const detachedLayout = removeSurfaceFromWindows(
    removeSurfaceFromRail(normalizedLayout, surfaceId),
    surfaceId,
  )
  const nextLayout = insertSurfaceWindow(detachedLayout, surfaceId, destination)

  return normalizeWorkspaceLayout(recordStickyPlacement(nextLayout, surfaceId, destination))
}

export function moveWindow(
  layout: WorkspaceLayout,
  windowId: WindowId,
  destination: SnapDestination,
): WorkspaceLayout {
  const normalizedLayout = normalizeWorkspaceLayout(layout)
  const window = normalizedLayout.windowsById[windowId]
  if (!window) return normalizedLayout
  if (destination.kind === 'background' || destination.kind === 'rail') {
    return backgroundWindowSurfaces(normalizedLayout, window)
  }
  if (destination.kind === 'recipe-slot') {
    return moveWindow(
      normalizedLayout,
      windowId,
      destinationForRecipeSlotDrop(normalizedLayout, destination),
    )
  }
  if (destination.kind === 'window-center') {
    return tabWindow(normalizedLayout, windowId, destination.windowId, destination.tabIndex)
  }
  if (windowMoveRejected(normalizedLayout, windowId, destination)) return normalizedLayout

  const nodeId = findNodeIdForWindow(normalizedLayout, windowId)
  if (!nodeId) return normalizedLayout

  const sameSplitLayout = moveNodeWithinSameSplit(normalizedLayout, nodeId, destination)
  if (sameSplitLayout) {
    return normalizeWorkspaceLayout(
      recordStickyPlacementsForWindow(sameSplitLayout, window, destination),
    )
  }

  const detached = detachNode(normalizedLayout, nodeId)
  if (!detached) return normalizedLayout

  const insertedLayout = insertNodeAtDestination(detached.layout, detached.node, destination)

  return normalizeWorkspaceLayout(
    recordStickyPlacementsForWindow(insertedLayout, window, destination),
  )
}

export function tabSurface(
  layout: WorkspaceLayout,
  surfaceId: SurfaceId,
  targetWindowId: WindowId,
  index?: number,
): WorkspaceLayout {
  const normalizedLayout = normalizeWorkspaceLayout(layout)
  const updatedLayout = tabSurfaceInLayout(normalizedLayout, surfaceId, targetWindowId, index)

  return normalizeWorkspaceLayout(updatedLayout)
}

function tabSurfaceInLayout(
  layout: WorkspaceLayout,
  surfaceId: SurfaceId,
  targetWindowId: WindowId,
  index?: number,
  options: TabSurfaceInLayoutOptions = {},
): WorkspaceLayout {
  const targetWindow = layout.windowsById[targetWindowId]
  const surface = layout.surfacesById[surfaceId]
  if (!targetWindow || !surface) return layout
  if (
    !surfaceCanUseDestination(layout, surfaceId, {
      kind: 'window-center',
      windowId: targetWindowId,
    })
  ) {
    return layout
  }

  const detachedLayout = removeSurfaceFromOtherWindows(
    removeSurfaceFromRail(layout, surfaceId),
    surfaceId,
    targetWindowId,
  )
  const updatedLayout = addSurfaceToWindow(detachedLayout, surfaceId, targetWindowId, index)
  if (options.recordStickyPlacement === false) return updatedLayout

  const stickyLayout = recordStickyPlacement(updatedLayout, surfaceId, {
    kind: 'window-center',
    tabIndex: index,
    windowId: targetWindowId,
  })

  return stickyLayout
}

export function reorderSurface(
  layout: WorkspaceLayout,
  windowId: WindowId,
  fromIndex: number,
  toIndex: number,
): WorkspaceLayout {
  const normalizedLayout = normalizeWorkspaceLayout(layout)
  const window = normalizedLayout.windowsById[windowId]
  if (!window) return normalizedLayout
  if (!validReorder(window, fromIndex, toIndex)) return normalizedLayout

  const surfaceIds = moveItem(window.surfaceIds, fromIndex, toIndex)

  return normalizeWorkspaceLayout({
    ...normalizedLayout,
    windowsById: {
      ...normalizedLayout.windowsById,
      [windowId]: {
        ...window,
        surfaceIds,
      },
    },
  })
}

function placeSurface(
  layout: WorkspaceLayout,
  surfaceId: SurfaceId,
  placement?: SurfacePlacementHint,
): WorkspaceLayout {
  const surface = layout.surfacesById[surfaceId]
  if (!surface) return layout

  const destination = destinationForSurfacePlacement(layout, surface, placement)
  if (!destination) return ensureSurfaceIsVisible(layout, surfaceId)
  if (destination.kind === 'background' || destination.kind === 'rail') {
    return addSurfaceToRail(
      removeSurfaceFromWindows(layout, surfaceId),
      surfaceId,
      'backgroundSurfaceIds',
    )
  }
  if (destination.kind === 'recipe-slot') {
    return placeSurface(layout, surfaceId, { kind: 'recipe-slot', slot: destination.slot })
  }
  if (destination.kind === 'window-center') {
    return tabSurfaceInLayout(layout, surfaceId, destination.windowId, destination.tabIndex, {
      recordStickyPlacement: placement?.kind !== 'recipe-slot',
    })
  }

  return placeSurfaceAtEdgeDestination(layout, surfaceId, destination, {
    recordStickyPlacement: placement?.kind !== 'recipe-slot',
  })
}

function ensureSurfaceIsVisible(layout: WorkspaceLayout, surfaceId: SurfaceId): WorkspaceLayout {
  const activeWindowId = layout.activeWindowId
  if (activeWindowId && layout.windowsById[activeWindowId]) {
    return tabSurfaceInLayout(layout, surfaceId, activeWindowId)
  }

  return createRootSurfaceWindow(removeSurfaceFromRail(layout, surfaceId), surfaceId)
}

function placeSurfaceAtEdgeDestination(
  layout: WorkspaceLayout,
  surfaceId: SurfaceId,
  destination: SnapDestination,
  options: { readonly recordStickyPlacement: boolean } = { recordStickyPlacement: true },
): WorkspaceLayout {
  const surface = layout.surfacesById[surfaceId]
  if (!surface) return layout
  if (!surfaceCanUseDestination(layout, surfaceId, destination)) return layout

  const detachedLayout = removeSurfaceFromWindows(
    removeSurfaceFromRail(layout, surfaceId),
    surfaceId,
  )
  const nextLayout = insertSurfaceWindow(detachedLayout, surfaceId, destination)
  if (!options.recordStickyPlacement) return nextLayout

  return recordStickyPlacement(nextLayout, surfaceId, destination)
}

function destinationForPlacement(
  layout: WorkspaceLayout,
  placement?: SurfacePlacementHint,
): SnapDestination | null {
  if (!placement) return activeWindowDestination(layout)

  switch (placement.kind) {
    case 'active-window':
      return activeWindowDestination(layout, placement.tabIndex)
    case 'parent-edge':
      return { edge: placement.edge, kind: 'parent-edge', nodeId: placement.nodeId }
    case 'background':
      return { kind: 'background' }
    case 'rail':
      return { kind: 'rail' }
    case 'recipe-slot':
      return destinationForRecipeSlot(layout, placement.slot)
    case 'root-edge':
      return { edge: placement.edge, kind: 'root-edge' }
    case 'window-center':
      return { kind: 'window-center', tabIndex: placement.tabIndex, windowId: placement.windowId }
    case 'window-edge':
      return { edge: placement.edge, kind: 'window-edge', windowId: placement.windowId }
  }
}

function destinationForSurfacePlacement(
  layout: WorkspaceLayout,
  surface: Surface,
  placement?: SurfacePlacementHint,
) {
  if (surface.lifecycle === 'transient' && placement?.kind === 'recipe-slot') {
    const activeDestination = activeWindowDestination(layout)
    if (activeDestination && surfaceCanUseDestination(layout, surface.id, activeDestination)) {
      return activeDestination
    }

    return destinationForPlacement(layout, placement)
  }

  return destinationForPlacement(layout, placement)
}

function destinationForRecipeSlot(
  layout: WorkspaceLayout,
  slot: WorkspaceRecipeSlot,
): SnapDestination | null {
  if (isToolPaneRecipeSlot(slot)) return destinationForToolPaneSlot(layout, slot)
  if (slot === 'editor-center') return destinationForMainViewSlot(layout)

  const slotWindowId = visibleWindowIdForRecipeSlot(layout, slot)
  if (slotWindowId) return { kind: 'window-center', windowId: slotWindowId }

  if (slot === 'bottom') return rootOrActiveDestination(layout, 'bottom')
  if (slot === 'rail') return { kind: 'rail' }

  return activeWindowDestination(layout)
}

function destinationForRecipeSlotDrop(
  layout: WorkspaceLayout,
  destination: Extract<SnapDestination, { readonly kind: 'recipe-slot' }>,
) {
  return destinationForRecipeSlot(layout, destination.slot) ?? ({ kind: 'background' } as const)
}

function destinationForMainViewSlot(layout: WorkspaceLayout): SnapDestination | null {
  const mainWindowId = visibleWindowIdForRecipeSlot(layout, 'editor-center')
  if (mainWindowId) return { kind: 'window-center', windowId: mainWindowId }

  const toolWindowIds = visibleWindowIdsForRecipeSlots(layout, ['left-tool-pane'])
  if (toolWindowIds.length > 0) return rootOrActiveDestination(layout, 'right')

  return mainViewFallbackDestination(layout)
}

function destinationForToolPaneSlot(
  layout: WorkspaceLayout,
  slot: Extract<WorkspaceRecipeSlot, 'left-tool-pane'>,
): SnapDestination | null {
  const sameSlotWindowIds = visibleWindowIdsForRecipeSlots(layout, [slot])
  if (sameSlotWindowIds.length > 0) return toolPaneSameSlotDestination(sameSlotWindowIds)

  return rootOrActiveDestination(layout, 'left')
}

function toolPaneSameSlotDestination(windowIds: readonly WindowId[]): SnapDestination | null {
  const targetWindowId = targetToolWindowId(windowIds)
  if (!targetWindowId) return null

  return { edge: 'bottom', kind: 'window-edge', windowId: targetWindowId }
}

function targetToolWindowId(toolWindowIds: readonly WindowId[]) {
  return toolWindowIds[toolWindowIds.length - 1]
}

function rootOrActiveDestination(
  layout: WorkspaceLayout,
  edge: LayoutEdge,
): SnapDestination | null {
  if (layout.rootNodeId) return { edge, kind: 'root-edge' }

  return activeWindowDestination(layout)
}

function mainViewFallbackDestination(layout: WorkspaceLayout): SnapDestination | null {
  const activeDestination = activeWindowDestination(layout)
  if (activeDestination?.kind !== 'window-center') return activeDestination
  if (activeWindowContainsRecipeSlot(layout, 'bottom'))
    return rootOrActiveDestination(layout, 'top')
  return activeDestination
}

function activeWindowContainsRecipeSlot(layout: WorkspaceLayout, slot: WorkspaceRecipeSlot) {
  const activeWindowId = layout.activeWindowId
  if (!activeWindowId) return false

  return windowContainsRecipeSlot(layout, layout.windowsById[activeWindowId], slot)
}

function activeWindowDestination(
  layout: WorkspaceLayout,
  tabIndex?: number,
): SnapDestination | null {
  if (!layout.activeWindowId) return null
  if (!layoutHasVisibleWindow(layout, layout.activeWindowId)) return null

  return { kind: 'window-center', tabIndex, windowId: layout.activeWindowId }
}

function layoutHasVisibleWindow(layout: WorkspaceLayout, windowId: WindowId) {
  return visibleWindowIdsInOrder(layout).includes(windowId)
}

function findExistingSurfaceForOpen(layout: WorkspaceLayout, surface: Surface) {
  const sameIdSurface = layout.surfacesById[surface.id]
  if (sameIdSurface) return sameIdSurface
  if (surface.cardinality !== 'singleton') return null

  return (
    Object.values(layout.surfacesById).find((candidate) => candidate.type === surface.type) ?? null
  )
}

function surfaceForOpen(existingSurface: Surface | null, incomingSurface: Surface) {
  if (!existingSurface) return incomingSurface
  if (shouldPromoteSurface(existingSurface, incomingSurface)) return incomingSurface
  if (shouldRefreshExistingSurface(existingSurface, incomingSurface)) {
    return {
      ...incomingSurface,
      placement: existingSurface.placement ?? incomingSurface.placement,
    }
  }
  if (incomingSurface.lifecycle === 'transient') return incomingSurface

  return existingSurface
}

function shouldRefreshExistingSurface(existingSurface: Surface, incomingSurface: Surface) {
  if (existingSurface.id !== incomingSurface.id) return false

  return incomingSurface.serializedState !== undefined
}

function shouldPromoteSurface(existingSurface: Surface, incomingSurface: Surface) {
  if (existingSurface.id !== incomingSurface.id) return false
  if (existingSurface.lifecycle !== 'transient') return false

  return incomingSurface.lifecycle !== 'transient'
}

function placementForOpen(
  layout: WorkspaceLayout,
  surface: Surface,
  policyId?: LayoutPolicyId,
): PlacementResolution {
  const stickyPlacement = stickyPlacementForSurface(layout, surface.id, policyId)
  if (stickyPlacement && placementCanRestoreSurface(layout, stickyPlacement, surface)) {
    return { layout, placement: stickyPlacement }
  }
  if (stickyPlacement) {
    return fallbackPlacementForOpen(
      clearStickyPlacement(layout, surface.id, policyId),
      surface,
      policyId,
    )
  }

  return fallbackPlacementForOpen(layout, surface, policyId)
}

function fallbackPlacementForOpen(
  layout: WorkspaceLayout,
  surface: Surface,
  policyId?: LayoutPolicyId,
): PlacementResolution {
  if (policyId) {
    const policyPlacement = placementForSurfaceWithPolicy({ layout, policyId, surface })
    if (placementCanRestoreSurface(layout, policyPlacement, surface)) {
      return { layout, placement: policyPlacement }
    }
  }

  const placement = surface.placement
  if (placement && placementCanRestoreSurface(layout, placement)) {
    return { layout, placement }
  }

  return { layout, placement: { kind: 'recipe-slot', slot: recipeSlotForSurface(layout, surface) } }
}

function upsertSurface(layout: WorkspaceLayout, surface: Surface): WorkspaceLayout {
  return {
    ...layout,
    surfacesById: {
      ...layout.surfacesById,
      [surface.id]: surface,
    },
  }
}

function deleteSurfaceFromLayout(layout: WorkspaceLayout, surfaceId: SurfaceId): WorkspaceLayout {
  const surfacesById = { ...layout.surfacesById }
  delete surfacesById[surfaceId]

  const withoutVisibleSurface = removeSurfaceFromWindows(layout, surfaceId)
  const withoutRailSurface = deleteSurfaceFromRail(withoutVisibleSurface, surfaceId)

  return {
    ...withoutRailSurface,
    mruSurfaceIds: withoutRailSurface.mruSurfaceIds.filter((id) => id !== surfaceId),
    surfacesById,
  }
}

function removeSurfaceFromWindows(layout: WorkspaceLayout, surfaceId: SurfaceId): WorkspaceLayout {
  const windowsById: Record<string, WorkbenchWindow> = {}

  for (const window of Object.values(layout.windowsById)) {
    const repairedWindow = removeSurfaceFromWindow(window, surfaceId)
    if (!repairedWindow) continue

    windowsById[window.id] = repairedWindow
  }

  return {
    ...layout,
    windowsById,
  }
}

function removeSurfaceFromOtherWindows(
  layout: WorkspaceLayout,
  surfaceId: SurfaceId,
  targetWindowId: WindowId,
): WorkspaceLayout {
  const windowsById: Record<string, WorkbenchWindow> = {}

  for (const window of Object.values(layout.windowsById)) {
    if (window.id === targetWindowId) {
      windowsById[window.id] = window
      continue
    }

    const repairedWindow = removeSurfaceFromWindow(window, surfaceId)
    if (!repairedWindow) continue

    windowsById[window.id] = repairedWindow
  }

  return {
    ...layout,
    windowsById,
  }
}

function removeSurfaceFromWindow(
  window: WorkbenchWindow,
  surfaceId: SurfaceId,
): WorkbenchWindow | null {
  const removedIndex = window.surfaceIds.indexOf(surfaceId)
  const surfaceIds = window.surfaceIds.filter((id) => id !== surfaceId)
  if (surfaceIds.length === 0) return null

  const activeSurfaceId =
    window.activeSurfaceId === surfaceId
      ? fallbackSurfaceIdAfterRemoval(surfaceIds, removedIndex)
      : window.activeSurfaceId

  return {
    ...window,
    activeSurfaceId,
    pinnedSurfaceIds: window.pinnedSurfaceIds.filter((id) => id !== surfaceId),
    previewSurfaceId: window.previewSurfaceId === surfaceId ? undefined : window.previewSurfaceId,
    surfaceIds,
  }
}

function fallbackSurfaceIdAfterRemoval(surfaceIds: readonly SurfaceId[], removedIndex: number) {
  const fallbackIndex = Math.max(0, Math.min(removedIndex, surfaceIds.length - 1))

  return surfaceIds[fallbackIndex]
}

function addSurfaceToWindow(
  layout: WorkspaceLayout,
  surfaceId: SurfaceId,
  windowId: WindowId,
  index?: number,
): WorkspaceLayout {
  const surface = layout.surfacesById[surfaceId]
  const window = layout.windowsById[windowId]
  if (!surface || !window) return layout

  const previewCleanup = removeReplacedPreview(layout, surface)
  const targetWindow = previewCleanup.windowsById[windowId] ?? window
  const surfaceIds = insertSurfaceId(targetWindow.surfaceIds, surfaceId, index)

  return {
    ...previewCleanup,
    activeSurfaceId: surfaceId,
    activeWindowId: windowId,
    windowsById: {
      ...previewCleanup.windowsById,
      [windowId]: {
        ...targetWindow,
        activeSurfaceId: surfaceId,
        previewSurfaceId: previewSurfaceIdAfterInsert(surface, targetWindow.previewSurfaceId),
        surfaceIds,
      },
    },
  }
}

function removeReplacedPreview(layout: WorkspaceLayout, surface: Surface): WorkspaceLayout {
  if (surface.lifecycle !== 'transient') return layout

  const replacedPreviewIds = transientPreviewIdsForReplacement(layout, surface.id)
  let nextLayout = layout

  for (const previewSurfaceId of replacedPreviewIds) {
    nextLayout = deleteSurfaceFromLayout(nextLayout, previewSurfaceId)
  }

  return nextLayout
}

function transientPreviewIdsForReplacement(layout: WorkspaceLayout, incomingSurfaceId: SurfaceId) {
  const previewSurfaceIds: SurfaceId[] = []

  for (const window of Object.values(layout.windowsById)) {
    const previewSurfaceId = window.previewSurfaceId
    if (!previewSurfaceId) continue
    if (previewSurfaceId === incomingSurfaceId) continue

    const previewSurface = layout.surfacesById[previewSurfaceId]
    if (previewSurface?.lifecycle !== 'transient') continue

    previewSurfaceIds.push(previewSurfaceId)
  }

  return previewSurfaceIds
}

function previewSurfaceIdAfterInsert(surface: Surface, currentPreviewSurfaceId?: SurfaceId) {
  if (surface.lifecycle === 'transient') return surface.id
  if (currentPreviewSurfaceId === surface.id) return undefined

  return currentPreviewSurfaceId
}

function insertSurfaceId(surfaceIds: readonly SurfaceId[], surfaceId: SurfaceId, index?: number) {
  const withoutSurface = surfaceIds.filter((id) => id !== surfaceId)
  const insertIndex = clampIndex(index ?? withoutSurface.length, withoutSurface.length)

  return [...withoutSurface.slice(0, insertIndex), surfaceId, ...withoutSurface.slice(insertIndex)]
}

function moveSingleSurfaceWindow(
  layout: WorkspaceLayout,
  surfaceId: SurfaceId,
  destination: SnapDestination,
): WorkspaceLayout | null {
  const sourceWindowId = findWindowIdContainingSurface(layout, surfaceId)
  if (!sourceWindowId) return null

  const sourceWindow = layout.windowsById[sourceWindowId]
  if (sourceWindow.surfaceIds.length !== 1) return null
  if (surfaceMoveRejected(layout, sourceWindowId, destination)) return layout

  return moveWindow(layout, sourceWindowId, destination)
}

function insertSurfaceWindow(
  layout: WorkspaceLayout,
  surfaceId: SurfaceId,
  destination: SnapDestination,
): WorkspaceLayout {
  const surfaceWindow = createSurfaceWindow(layout, surfaceId)
  const layoutWithWindow = {
    ...layout,
    windowsById: {
      ...layout.windowsById,
      [surfaceWindow.window.id]: surfaceWindow.window,
    },
  }

  const insertedLayout = insertNodeAtDestination(layoutWithWindow, surfaceWindow.node, destination)

  return {
    ...insertedLayout,
    activeSurfaceId: surfaceId,
    activeWindowId: surfaceWindow.window.id,
  }
}

function createRootSurfaceWindow(layout: WorkspaceLayout, surfaceId: SurfaceId): WorkspaceLayout {
  const surfaceWindow = createSurfaceWindow(layout, surfaceId)

  return {
    ...layout,
    activeSurfaceId: surfaceId,
    activeWindowId: surfaceWindow.window.id,
    nodesById: {
      [surfaceWindow.node.id]: surfaceWindow.node,
    },
    rootNodeId: surfaceWindow.node.id,
    windowsById: {
      [surfaceWindow.window.id]: surfaceWindow.window,
    },
  }
}

function createSurfaceWindow(layout: WorkspaceLayout, surfaceId: SurfaceId) {
  const surfaceType = layout.surfacesById[surfaceId]?.type ?? 'surface'
  const windowId = uniqueWindowId(layout, surfaceType)
  const nodeId = uniqueNodeId(layout, surfaceType)
  const window = {
    activeSurfaceId: surfaceId,
    id: windowId,
    mode: 'normal',
    pinnedSurfaceIds: [],
    previewSurfaceId: previewSurfaceIdForNewWindow(layout, surfaceId),
    surfaceIds: [surfaceId],
  } satisfies WorkbenchWindow
  const node = {
    id: nodeId,
    kind: 'window',
    windowId,
  } satisfies LayoutNode

  return { node, window }
}

function previewSurfaceIdForNewWindow(layout: WorkspaceLayout, surfaceId: SurfaceId) {
  const surface = layout.surfacesById[surfaceId]
  if (surface?.lifecycle !== 'transient') return undefined

  return surfaceId
}

function insertNodeAtDestination(
  layout: WorkspaceLayout,
  node: LayoutNode,
  destination: SnapDestination,
): WorkspaceLayout {
  if (destination.kind === 'root-edge') return insertNodeAtRootEdge(layout, node, destination.edge)
  if (destination.kind === 'window-edge') {
    return insertNodeAtWindowEdge(layout, node, destination.windowId, destination.edge)
  }
  if (destination.kind === 'parent-edge') {
    return insertNodeAtParentEdge(layout, node, destination.nodeId, destination.edge)
  }

  return layout
}

function insertNodeAtWindowEdge(
  layout: WorkspaceLayout,
  node: LayoutNode,
  targetWindowId: WindowId,
  edge: LayoutEdge,
): WorkspaceLayout {
  const targetNodeId = findNodeIdForWindow(layout, targetWindowId)
  if (!targetNodeId) return insertNodeAtRootEdge(layout, node, edge)

  return insertNodeAroundTarget(layout, node, targetNodeId, edge)
}

function insertNodeAtParentEdge(
  layout: WorkspaceLayout,
  node: LayoutNode,
  targetNodeId: LayoutNodeId,
  edge: LayoutEdge,
): WorkspaceLayout {
  const parentNodeId = findParentNodeId(layout, targetNodeId)
  if (!parentNodeId) return insertNodeAtRootEdge(layout, node, edge)

  return insertNodeAroundTarget(layout, node, parentNodeId, edge)
}

function insertNodeAtRootEdge(
  layout: WorkspaceLayout,
  node: LayoutNode,
  edge: LayoutEdge,
): WorkspaceLayout {
  if (!layout.rootNodeId) return layoutWithRootNode(layout, node)
  if (layout.rootNodeId === node.id) return layout

  return insertNodeAroundTarget(layout, node, layout.rootNodeId, edge)
}

function insertNodeAroundTarget(
  layout: WorkspaceLayout,
  node: LayoutNode,
  targetNodeId: LayoutNodeId,
  edge: LayoutEdge,
): WorkspaceLayout {
  const targetNode = layout.nodesById[targetNodeId]
  if (!targetNode) return layoutWithRootNode(layout, node)

  const parentNodeId = findParentNodeId(layout, targetNodeId)
  const parentNode = parentNodeId ? layout.nodesById[parentNodeId] : null
  if (parentNode?.kind === 'split' && parentNode.axis === edgeAxis(edge)) {
    return insertNodeIntoSplit(layout, node, parentNode, targetNodeId, edge)
  }

  return wrapTargetWithSplit(layout, node, targetNode, edge)
}

function moveNodeWithinSameSplit(
  layout: WorkspaceLayout,
  nodeId: LayoutNodeId,
  destination: SnapDestination,
) {
  if (destination.kind !== 'window-edge') return null

  const targetNodeId = findNodeIdForWindow(layout, destination.windowId)
  if (!targetNodeId) return null

  const sourceParentNodeId = findParentNodeId(layout, nodeId)
  const targetParentNodeId = findParentNodeId(layout, targetNodeId)
  if (!sourceParentNodeId) return null
  if (sourceParentNodeId !== targetParentNodeId) return null

  const split = layout.nodesById[sourceParentNodeId]
  if (!split || split.kind !== 'split') return null
  if (split.axis !== edgeAxis(destination.edge)) return null

  return layoutWithMovedSplitChild(layout, split, nodeId, targetNodeId, destination.edge)
}

function layoutWithMovedSplitChild(
  layout: WorkspaceLayout,
  split: LayoutSplitNode,
  sourceNodeId: LayoutNodeId,
  targetNodeId: LayoutNodeId,
  edge: LayoutEdge,
) {
  const sourceIndex = split.childIds.indexOf(sourceNodeId)
  const targetIndex = split.childIds.indexOf(targetNodeId)
  if (sourceIndex < 0) return null
  if (targetIndex < 0) return null

  const insertIndex = sameSplitMoveInsertIndex(
    split.childIds.length,
    sourceIndex,
    targetIndex,
    edge,
  )
  if (sourceIndex === insertIndex) return layout

  const sizes = repairSplitSizes(split.sizes, split.childIds.length)

  return {
    ...layout,
    nodesById: {
      ...layout.nodesById,
      [split.id]: {
        ...split,
        childIds: moveItem(split.childIds, sourceIndex, insertIndex),
        sizes: moveItem(sizes, sourceIndex, insertIndex),
      },
    },
  }
}

function sameSplitMoveInsertIndex(
  childCount: number,
  sourceIndex: number,
  targetIndex: number,
  edge: LayoutEdge,
) {
  const destinationIndex = isLeadingEdge(edge) ? targetIndex : targetIndex + 1
  const shiftedIndex = sourceIndex < destinationIndex ? destinationIndex - 1 : destinationIndex

  return clampIndex(shiftedIndex, Math.max(0, childCount - 1))
}

function insertNodeIntoSplit(
  layout: WorkspaceLayout,
  node: LayoutNode,
  split: LayoutSplitNode,
  targetNodeId: LayoutNodeId,
  edge: LayoutEdge,
): WorkspaceLayout {
  const targetIndex = split.childIds.indexOf(targetNodeId)
  if (targetIndex < 0) return layout

  const insertIndex = isLeadingEdge(edge) ? targetIndex : targetIndex + 1
  const childIds = insertAt(split.childIds, node.id, insertIndex)
  const sizes = splitSizesWithInsertedNode(split, targetIndex, insertIndex)

  return {
    ...layout,
    nodesById: {
      ...layout.nodesById,
      [node.id]: node,
      [split.id]: {
        ...split,
        childIds,
        sizes,
      },
    },
  }
}

function wrapTargetWithSplit(
  layout: WorkspaceLayout,
  node: LayoutNode,
  targetNode: LayoutNode,
  edge: LayoutEdge,
): WorkspaceLayout {
  const splitNode = createWrappingSplit(layout, node.id, targetNode.id, edge)
  const nodesById = {
    ...layout.nodesById,
    [node.id]: node,
    [splitNode.id]: splitNode,
  }
  const parentNodeId = findParentNodeId(layout, targetNode.id)
  if (!parentNodeId) return { ...layout, nodesById, rootNodeId: splitNode.id }

  return {
    ...layout,
    nodesById: replaceChildNode(nodesById, parentNodeId, targetNode.id, splitNode.id),
  }
}

function layoutWithRootNode(layout: WorkspaceLayout, node: LayoutNode): WorkspaceLayout {
  return {
    ...layout,
    nodesById: {
      ...layout.nodesById,
      [node.id]: node,
    },
    rootNodeId: node.id,
  }
}

function createWrappingSplit(
  layout: WorkspaceLayout,
  insertNodeId: LayoutNodeId,
  targetNodeId: LayoutNodeId,
  edge: LayoutEdge,
): LayoutSplitNode {
  const childIds = isLeadingEdge(edge) ? [insertNodeId, targetNodeId] : [targetNodeId, insertNodeId]

  return {
    axis: edgeAxis(edge),
    childIds,
    id: uniqueNodeId(layout, `split-${edge}`),
    kind: 'split',
    sizes: [0.5, 0.5],
  }
}

function replaceChildNode(
  nodesById: Record<string, LayoutNode>,
  parentNodeId: LayoutNodeId,
  oldChildId: LayoutNodeId,
  newChildId: LayoutNodeId,
) {
  const parentNode = nodesById[parentNodeId]
  if (!parentNode || parentNode.kind !== 'split') return nodesById

  return {
    ...nodesById,
    [parentNodeId]: {
      ...parentNode,
      childIds: parentNode.childIds.map((childId) =>
        childId === oldChildId ? newChildId : childId,
      ),
    },
  }
}

function detachNode(layout: WorkspaceLayout, nodeId: LayoutNodeId) {
  const node = layout.nodesById[nodeId]
  if (!node) return null

  const nodesById = { ...layout.nodesById }
  delete nodesById[nodeId]

  const parentNodeId = findParentNodeId(layout, nodeId)
  if (!parentNodeId) {
    return {
      layout: { ...layout, nodesById, rootNodeId: null },
      node,
    }
  }

  return {
    layout: removeChildFromParent(layout, nodesById, parentNodeId, nodeId),
    node,
  }
}

function removeChildFromParent(
  layout: WorkspaceLayout,
  nodesById: Record<string, LayoutNode>,
  parentNodeId: LayoutNodeId,
  childNodeId: LayoutNodeId,
): WorkspaceLayout {
  const parentNode = nodesById[parentNodeId]
  if (!parentNode || parentNode.kind !== 'split') return { ...layout, nodesById }

  const removedIndex = parentNode.childIds.indexOf(childNodeId)

  return {
    ...layout,
    nodesById: {
      ...nodesById,
      [parentNodeId]: {
        ...parentNode,
        childIds: parentNode.childIds.filter((id) => id !== childNodeId),
        sizes: splitSizesWithoutChild(parentNode, removedIndex),
      },
    },
  }
}

function tabWindow(
  layout: WorkspaceLayout,
  sourceWindowId: WindowId,
  targetWindowId: WindowId,
  index?: number,
): WorkspaceLayout {
  if (sourceWindowId === targetWindowId) return layout

  const sourceWindow = layout.windowsById[sourceWindowId]
  const targetWindow = layout.windowsById[targetWindowId]
  if (!sourceWindow || !targetWindow) return layout
  if (!windowCanTabIntoWindow(layout, sourceWindowId, targetWindowId)) return layout

  const sourceNodeId = findNodeIdForWindow(layout, sourceWindowId)
  const detachedLayout = sourceNodeId
    ? (detachNode(layout, sourceNodeId)?.layout ?? layout)
    : layout
  const withoutSourceWindow = deleteWindow(detachedLayout, sourceWindowId)
  const mergedLayout = addSurfacesToWindow(
    withoutSourceWindow,
    sourceWindow.surfaceIds,
    targetWindowId,
    index,
  )
  const stickyLayout = recordStickyPlacementsForWindow(mergedLayout, sourceWindow, {
    kind: 'window-center',
    tabIndex: index,
    windowId: targetWindowId,
  })

  return normalizeWorkspaceLayout(stickyLayout)
}

function addSurfacesToWindow(
  layout: WorkspaceLayout,
  surfaceIds: readonly SurfaceId[],
  targetWindowId: WindowId,
  index?: number,
): WorkspaceLayout {
  let nextLayout = layout
  let nextIndex = index

  for (const surfaceId of surfaceIds) {
    nextLayout = addSurfaceToWindow(nextLayout, surfaceId, targetWindowId, nextIndex)
    nextIndex = nextIndex === undefined ? undefined : nextIndex + 1
  }

  return nextLayout
}

function backgroundWindowSurfaces(
  layout: WorkspaceLayout,
  window: WorkbenchWindow,
): WorkspaceLayout {
  let nextLayout = layout

  for (const surfaceId of window.surfaceIds) {
    nextLayout = backgroundSurface(nextLayout, surfaceId)
  }

  return normalizeWorkspaceLayout(nextLayout)
}

function windowMoveRejected(
  layout: WorkspaceLayout,
  windowId: WindowId,
  destination: SnapDestination,
) {
  const nodeId = findNodeIdForWindow(layout, windowId)
  if (!nodeId) return true
  if (destination.kind === 'background' || destination.kind === 'rail') return false
  if (destination.kind === 'recipe-slot') return false
  if (destination.kind === 'window-edge' && destination.windowId === windowId) return true
  if (destination.kind === 'window-center' && destination.windowId === windowId) return true
  if (destination.kind !== 'parent-edge') return false

  return isNodeDescendant(layout, nodeId, destination.nodeId)
}

function surfaceMoveRejected(
  layout: WorkspaceLayout,
  sourceWindowId: WindowId,
  destination: SnapDestination,
) {
  if (destination.kind === 'window-edge' && destination.windowId === sourceWindowId) return true
  if (destination.kind === 'background' || destination.kind === 'rail') return false
  if (destination.kind === 'recipe-slot') return false

  const nodeId = findNodeIdForWindow(layout, sourceWindowId)
  if (!nodeId || destination.kind !== 'parent-edge') return false

  return isNodeDescendant(layout, nodeId, destination.nodeId)
}

function addSurfaceToRail(
  layout: WorkspaceLayout,
  surfaceId: SurfaceId,
  key: 'backgroundSurfaceIds' | 'runningSurfaceIds',
): WorkspaceLayout {
  const surfaceIds = layout.rail[key] ?? []
  if (surfaceIds.includes(surfaceId)) return layout

  return {
    ...layout,
    rail: {
      ...layout.rail,
      [key]: surfaceIds.concat(surfaceId),
    },
  }
}

function removeSurfaceFromRail(layout: WorkspaceLayout, surfaceId: SurfaceId): WorkspaceLayout {
  return {
    ...layout,
    rail: {
      ...layout.rail,
      backgroundSurfaceIds: layout.rail.backgroundSurfaceIds.filter((id) => id !== surfaceId),
    },
  }
}

function deleteSurfaceFromRail(layout: WorkspaceLayout, surfaceId: SurfaceId): WorkspaceLayout {
  return {
    ...layout,
    rail: {
      ...layout.rail,
      backgroundSurfaceIds: layout.rail.backgroundSurfaceIds.filter((id) => id !== surfaceId),
      pinnedSurfaceIds: layout.rail.pinnedSurfaceIds.filter((id) => id !== surfaceId),
      runningSurfaceIds: layout.rail.runningSurfaceIds.filter((id) => id !== surfaceId),
      visibleSingletonSurfaceIds: layout.rail.visibleSingletonSurfaceIds.filter(
        (id) => id !== surfaceId,
      ),
    },
  }
}

function recordStickyPlacement(
  layout: WorkspaceLayout,
  surfaceId: SurfaceId,
  destination: SnapDestination,
): WorkspaceLayout {
  const placement = placementFromDestination(destination)
  if (!placement) return layout

  return setStickyPlacement(layout, surfaceId, placement)
}

function recordStickyPlacementsForWindow(
  layout: WorkspaceLayout,
  window: WorkbenchWindow,
  destination: SnapDestination,
) {
  let nextLayout = layout

  for (const surfaceId of window.surfaceIds) {
    nextLayout = recordStickyPlacement(nextLayout, surfaceId, destination)
  }

  return nextLayout
}

function placementFromDestination(destination: SnapDestination): SurfacePlacementHint | null {
  switch (destination.kind) {
    case 'parent-edge':
      return { edge: destination.edge, kind: 'parent-edge', nodeId: destination.nodeId }
    case 'background':
      return { kind: 'background' }
    case 'rail':
      return { kind: 'rail' }
    case 'recipe-slot':
      return { kind: 'recipe-slot', slot: destination.slot }
    case 'root-edge':
      return { edge: destination.edge, kind: 'root-edge' }
    case 'window-center':
      return {
        kind: 'window-center',
        tabIndex: destination.tabIndex,
        windowId: destination.windowId,
      }
    case 'window-edge':
      return { edge: destination.edge, kind: 'window-edge', windowId: destination.windowId }
  }
}

function setStickyPlacement(
  layout: WorkspaceLayout,
  surfaceId: SurfaceId,
  placement: SurfacePlacementHint,
): WorkspaceLayout {
  const policy = policyForStickyPlacement(layout)
  if (!policy) return layout

  return {
    ...layout,
    policiesById: {
      ...layout.policiesById,
      [policy.id]: {
        ...policy,
        stickyPlacementsBySurfaceId: {
          ...policy.stickyPlacementsBySurfaceId,
          [surfaceId]: placement,
        },
      },
    },
  }
}

function clearStickyPlacement(
  layout: WorkspaceLayout,
  surfaceId: SurfaceId,
  policyId?: LayoutPolicyId,
): WorkspaceLayout {
  const policy = policyId ? layout.policiesById[policyId] : policyForStickyPlacement(layout)
  if (!policy?.stickyPlacementsBySurfaceId[surfaceId]) return layout

  const stickyPlacementsBySurfaceId = { ...policy.stickyPlacementsBySurfaceId }
  delete stickyPlacementsBySurfaceId[surfaceId]

  return {
    ...layout,
    policiesById: {
      ...layout.policiesById,
      [policy.id]: {
        ...policy,
        stickyPlacementsBySurfaceId,
      },
    },
  }
}

function deleteWindow(layout: WorkspaceLayout, windowId: WindowId): WorkspaceLayout {
  const windowsById = { ...layout.windowsById }
  delete windowsById[windowId]

  return {
    ...layout,
    windowsById,
  }
}

function layoutWithCollapsedWindow(
  layout: WorkspaceLayout,
  windowId: WindowId,
  edge: LayoutEdge | undefined,
): WorkspaceLayout {
  if (!edge) return layoutWithWindowMode(layout, windowId, 'collapsed')
  if (windowUsesLeftToolPaneRecipeSlot(layout, windowId)) {
    return layoutWithWindowMode(layout, windowId, 'collapsed', edge)
  }

  const expandedLayout = layoutWithWindowMode(layout, windowId, 'normal')
  const movedLayout = moveWindow(expandedLayout, windowId, { edge, kind: 'root-edge' })

  return layoutWithWindowMode(movedLayout, windowId, 'collapsed', edge)
}

function windowUsesLeftToolPaneRecipeSlot(layout: WorkspaceLayout, windowId: WindowId) {
  const window = layout.windowsById[windowId]
  if (!window) return false
  if (window.surfaceIds.length === 0) return false

  return window.surfaceIds.every((surfaceId) => {
    const surface = layout.surfacesById[surfaceId]
    if (!surface) return false

    return isToolPaneRecipeSlot(recipeSlotForSurface(layout, surface))
  })
}

function validReorder(window: WorkbenchWindow, fromIndex: number, toIndex: number) {
  if (fromIndex < 0 || fromIndex >= window.surfaceIds.length) return false
  if (toIndex < 0 || toIndex >= window.surfaceIds.length) return false

  return true
}

function moveItem<TItem>(items: readonly TItem[], fromIndex: number, toIndex: number) {
  const nextItems = items.slice()
  const [item] = nextItems.splice(fromIndex, 1)
  if (item === undefined) return items

  nextItems.splice(toIndex, 0, item)
  return nextItems
}

function splitSizesWithInsertedNode(
  split: LayoutSplitNode,
  targetIndex: number,
  insertIndex: number,
) {
  const sizes = repairSplitSizes(split.sizes, split.childIds.length)
  const targetSize = sizes[targetIndex] ?? 1
  const nextSizes = sizes.slice()
  nextSizes[targetIndex] = targetSize / 2
  nextSizes.splice(insertIndex, 0, targetSize / 2)

  return repairSplitSizes(nextSizes, nextSizes.length)
}

function splitSizesWithoutChild(split: LayoutSplitNode, removedIndex: number) {
  const sizes = repairSplitSizes(split.sizes, split.childIds.length)
  if (removedIndex < 0) return repairSplitSizes(sizes.slice(0, -1), Math.max(0, sizes.length - 1))

  const removedSize = sizes[removedIndex] ?? 0
  const nextSizes = sizes.filter((_, index) => index !== removedIndex)
  const recipientIndex = removedSizeRecipientIndex(removedIndex, nextSizes.length)
  if (recipientIndex >= 0)
    nextSizes[recipientIndex] = (nextSizes[recipientIndex] ?? 0) + removedSize

  return repairSplitSizes(nextSizes, nextSizes.length)
}

function removedSizeRecipientIndex(removedIndex: number, remainingCount: number) {
  if (remainingCount <= 0) return -1

  return Math.max(0, Math.min(removedIndex - 1, remainingCount - 1))
}

function insertAt<TItem>(items: readonly TItem[], item: TItem, index: number): TItem[] {
  return items.toSpliced(clampIndex(index, items.length), 0, item)
}

function uniqueWindowId(layout: WorkspaceLayout, key: string): WindowId {
  return uniqueId((candidate) => !layout.windowsById[candidate], workbenchWindowId, key)
}

function uniqueNodeId(layout: WorkspaceLayout, key: string): LayoutNodeId {
  return uniqueId((candidate) => !layout.nodesById[candidate], layoutNodeId, key)
}

function uniqueId<TId extends string>(
  available: (candidate: TId) => boolean,
  build: (key: string) => TId,
  key: string,
) {
  const firstId = build(key)
  if (available(firstId)) return firstId

  for (let index = 2; index < 1000; index += 1) {
    const candidate = build(`${key}:${index}`)
    if (available(candidate)) return candidate
  }

  throw createTilingInvariantError(`Unable to allocate layout id for ${key}`)
}
