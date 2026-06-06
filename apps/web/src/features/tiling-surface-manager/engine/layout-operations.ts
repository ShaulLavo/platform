import {
  layoutNodeId,
  workbenchWindowId,
} from '@/features/tiling-surface-manager/engine/layout-ids'
import {
  CLASSIC_DIAGNOSTICS_NODE_ID,
  CLASSIC_DIAGNOSTICS_WINDOW_ID,
  CLASSIC_ROOT_NODE_ID,
  createDiagnosticsSurface,
  createDiffSurface,
  createFileEditorSurface,
  createFileNavigatorSurface,
  createGitChangesSurface,
  createLogsSurface,
  createPlaceholderSurface,
  createSearchResultsSurface,
  createTerminalSurface,
  createSplitNode,
  createWindowNode,
  createWorkbenchWindow,
  createChatSurface,
} from '@/features/tiling-surface-manager/engine/layout-builders'
import {
  edgeAxis,
  findNodeIdForWindow,
  findParentNodeId,
  findWindowIdContainingSurface,
  isLeadingEdge,
  isNodeDescendant,
  normalizeWorkspaceLayout,
  repairSplitSizes,
  visibleSurfaceIdsInOrder,
  visibleWindowIdsInOrder,
} from '@/features/tiling-surface-manager/engine/layout-normalize'
import type {
  CustomWindowFrame,
  CustomWindowManagementCommand,
  DropEdge,
  DropDestination,
  LayoutCommandSurfaceSlot,
  LayoutOperation,
  LayoutNode,
  LayoutNodeId,
  LayoutPolicyId,
  LayoutPolicyState,
  LayoutSplitNode,
  RecipeId,
  Surface,
  SurfaceId,
  SurfacePlacementHint,
  SurfaceType,
  WorkspaceRecipeSlot,
  WindowId,
  WorkbenchWindow,
  WorkspaceLayout,
  WorkspaceLayoutCommand,
} from '@/features/tiling-surface-manager/engine/layout-types'

const RESIZE_REFERENCE_PX = 1000
const MIN_RESIZE_SIZE = 0.05
const RECIPE_LEFT_TOOL_SURFACE_TYPES = [
  'file-navigator',
  'search-results',
  'git-changes',
  'chat',
  'logs',
] as const satisfies readonly SurfaceType[]

type RecipeTree = {
  readonly nodeId: LayoutNodeId
  readonly nodesById: Record<string, LayoutNode>
}

type RecipeNodeAllocator = {
  readonly nodeId: (key: string) => LayoutNodeId
}

export type OpenSurfaceOptions = {
  readonly policyId?: LayoutPolicyId
}

export type CloseSurfaceOptions = {
  readonly force?: boolean
}

export function applyLayoutOperation(
  layout: WorkspaceLayout,
  operation: LayoutOperation,
): WorkspaceLayout {
  switch (operation.type) {
    case 'activateSurface':
      return activateSurface(layout, operation.surfaceId, operation.windowId)
    case 'toggleClassicBottomToolPane':
      return toggleClassicBottomToolPane(layout, operation.target)
    case 'hideClassicBottomToolPane':
      return hideClassicBottomToolPane(layout)
    case 'openSurface':
      return openSurface(layout, operation.surface, { policyId: operation.policyId })
    case 'closeSurface':
      return closeSurface(layout, operation.surfaceId)
    case 'collapseWindow':
      return collapseWindow(layout, operation.windowId)
    case 'expandWindow':
      return expandWindow(layout, operation.windowId)
    case 'restoreSurface':
      return restoreSurface(layout, operation.surfaceId, operation.placement)
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
      return resizeSplit(layout, operation.splitId, operation.handleIndex, operation.deltaPx)
    case 'maximizeWindow':
      return maximizeWindow(layout, operation.windowId)
    case 'restoreWindow':
      return restoreWindow(layout, operation.windowId)
    case 'applyRecipe':
      return applyRecipe(layout, operation.recipeId)
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

export function toggleClassicBottomToolPane(
  layout: WorkspaceLayout,
  target: 'diagnostics' | 'terminal',
): WorkspaceLayout {
  const normalizedLayout = normalizeWorkspaceLayout(layout)
  const preparedLayout = layoutWithClassicBottomToolPane(normalizedLayout)
  const targetSurfaceId = classicBottomToolPaneTargetSurfaceId(target)
  const visible = Boolean(findNodeIdForWindow(preparedLayout, CLASSIC_DIAGNOSTICS_WINDOW_ID))
  if (!visible) return showClassicBottomToolPane(preparedLayout, targetSurfaceId)

  return hideClassicBottomToolPane(preparedLayout)
}

export function hideClassicBottomToolPane(layout: WorkspaceLayout): WorkspaceLayout {
  const normalizedLayout = normalizeWorkspaceLayout(layout)
  const nodeId = findNodeIdForWindow(normalizedLayout, CLASSIC_DIAGNOSTICS_WINDOW_ID)
  if (!nodeId) return normalizedLayout

  const detached = detachNode(normalizedLayout, nodeId)
  if (!detached) return normalizedLayout

  return normalizeWorkspaceLayout(detached.layout)
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

export function collapseWindow(layout: WorkspaceLayout, windowId: WindowId): WorkspaceLayout {
  const normalizedLayout = normalizeWorkspaceLayout(layout)
  const window = normalizedLayout.windowsById[windowId]
  if (!window) return normalizedLayout
  if (!windowCanCollapse(normalizedLayout, window)) return normalizedLayout

  return normalizeToolPaneRecipeLayout(
    normalizeWorkspaceLayout(layoutWithWindowMode(normalizedLayout, windowId, 'collapsed')),
  )
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

type PlacementResolution = {
  readonly layout: WorkspaceLayout
  readonly placement: SurfacePlacementHint
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

function placementCanRestoreSurface(
  layout: WorkspaceLayout,
  placement: SurfacePlacementHint | undefined,
  surface?: Surface,
) {
  if (!placement) return false
  if (surface && !surface.capabilities.validPlacements.includes(placement.kind)) return false
  if (surface && !placementSatisfiesRecipeConstraints(layout, placement, surface)) return false

  switch (placement.kind) {
    case 'active-window':
      return Boolean(layout.activeWindowId && layoutHasVisibleWindow(layout, layout.activeWindowId))
    case 'parent-edge':
      return Boolean(layout.nodesById[placement.nodeId])
    case 'background':
    case 'rail':
      return false
    case 'recipe-slot':
      return true
    case 'root-edge':
      return Boolean(layout.rootNodeId)
    case 'window-center':
    case 'window-edge':
      return layoutHasVisibleWindow(layout, placement.windowId)
  }
}

function placementSatisfiesRecipeConstraints(
  layout: WorkspaceLayout,
  placement: SurfacePlacementHint,
  surface: Surface,
) {
  if (placement.kind !== 'recipe-slot') return true

  return placement.slot === recipeSlotForSurface(layout, surface)
}

function layoutWithClassicBottomToolPane(layout: WorkspaceLayout): WorkspaceLayout {
  const diagnostics =
    layout.surfacesById[createDiagnosticsSurface().id] ?? createDiagnosticsSurface()
  const terminal =
    layout.surfacesById[createTerminalSurface({ sessionId: 'terminal-1' }).id] ??
    createTerminalSurface({ sessionId: 'terminal-1' })
  const existingWindow = layout.windowsById[CLASSIC_DIAGNOSTICS_WINDOW_ID]
  const surfaceIds = classicBottomToolPaneSurfaceIds(layout, existingWindow, [
    diagnostics.id,
    terminal.id,
  ])
  const activeSurfaceId = classicBottomToolPaneActiveSurfaceId(existingWindow, surfaceIds)
  const window = createWorkbenchWindow({
    activeSurfaceId,
    id: CLASSIC_DIAGNOSTICS_WINDOW_ID,
    pinnedSurfaceIds: [diagnostics.id],
    surfaceIds,
  })

  return {
    ...layout,
    rail: railWithClassicBottomToolPaneSurfaces(layout, diagnostics.id, terminal.id),
    surfacesById: {
      ...layout.surfacesById,
      [diagnostics.id]: diagnostics,
      [terminal.id]: terminal,
    },
    windowsById: {
      ...layout.windowsById,
      [CLASSIC_DIAGNOSTICS_WINDOW_ID]: window,
    },
  }
}

function showClassicBottomToolPane(
  layout: WorkspaceLayout,
  targetSurfaceId: SurfaceId,
): WorkspaceLayout {
  return normalizeToolPaneRecipeLayout(showClassicBottomToolPaneLayout(layout, targetSurfaceId))
}

function showClassicBottomToolPaneLayout(
  layout: WorkspaceLayout,
  targetSurfaceId: SurfaceId,
): WorkspaceLayout {
  const preparedLayout = layoutWithClassicBottomToolPane(layout)
  const window = preparedLayout.windowsById[CLASSIC_DIAGNOSTICS_WINDOW_ID]
  if (!window) return normalizeWorkspaceLayout(preparedLayout)

  const deduplicatedLayout = removeClassicBottomToolPaneSurfacesFromOtherWindows(
    preparedLayout,
    window.surfaceIds,
  )
  const attachedLayout = attachClassicBottomToolPaneNode(deduplicatedLayout)
  const attachedWindow = attachedLayout.windowsById[CLASSIC_DIAGNOSTICS_WINDOW_ID] ?? window

  return normalizeWorkspaceLayout({
    ...attachedLayout,
    activeSurfaceId: targetSurfaceId,
    activeWindowId: CLASSIC_DIAGNOSTICS_WINDOW_ID,
    windowsById: {
      ...attachedLayout.windowsById,
      [CLASSIC_DIAGNOSTICS_WINDOW_ID]: {
        ...attachedWindow,
        activeSurfaceId: targetSurfaceId,
      },
    },
  })
}

function classicBottomToolPaneTargetSurfaceId(target: 'diagnostics' | 'terminal') {
  if (target === 'diagnostics') return createDiagnosticsSurface().id

  return createTerminalSurface({ sessionId: 'terminal-1' }).id
}

function classicBottomToolPaneSurfaceIds(
  layout: WorkspaceLayout,
  window: WorkbenchWindow | undefined,
  requiredSurfaceIds: readonly SurfaceId[],
) {
  const existingSurfaceIds = window?.surfaceIds.filter((surfaceId) => {
    const surface = layout.surfacesById[surfaceId]
    return surface?.type === 'diagnostics' || surface?.type === 'terminal'
  })

  return appendUniqueSurfaceIds(existingSurfaceIds ?? [], requiredSurfaceIds)
}

function classicBottomToolPaneActiveSurfaceId(
  window: WorkbenchWindow | undefined,
  surfaceIds: readonly SurfaceId[],
) {
  if (window && surfaceIds.includes(window.activeSurfaceId)) return window.activeSurfaceId

  return surfaceIds[surfaceIds.length - 1] ?? createTerminalSurface({ sessionId: 'terminal-1' }).id
}

function railWithClassicBottomToolPaneSurfaces(
  layout: WorkspaceLayout,
  diagnosticsSurfaceId: SurfaceId,
  terminalSurfaceId: SurfaceId,
) {
  return {
    ...layout.rail,
    backgroundSurfaceIds: (layout.rail.backgroundSurfaceIds ?? []).filter(
      (surfaceId) => surfaceId !== diagnosticsSurfaceId && surfaceId !== terminalSurfaceId,
    ),
    pinnedSurfaceIds: appendUniqueSurfaceIds(layout.rail.pinnedSurfaceIds, [diagnosticsSurfaceId]),
    runningSurfaceIds: appendUniqueSurfaceIds(layout.rail.runningSurfaceIds, [terminalSurfaceId]),
  }
}

function removeClassicBottomToolPaneSurfacesFromOtherWindows(
  layout: WorkspaceLayout,
  surfaceIds: readonly SurfaceId[],
): WorkspaceLayout {
  let nextLayout = layout

  for (const surfaceId of surfaceIds) {
    nextLayout = removeSurfaceFromOtherWindows(nextLayout, surfaceId, CLASSIC_DIAGNOSTICS_WINDOW_ID)
  }

  return nextLayout
}

function attachClassicBottomToolPaneNode(layout: WorkspaceLayout): WorkspaceLayout {
  if (findNodeIdForWindow(layout, CLASSIC_DIAGNOSTICS_WINDOW_ID)) return layout

  const contentNodeId = layout.rootNodeId
  const bottomNode = createWindowNode({
    id: CLASSIC_DIAGNOSTICS_NODE_ID,
    windowId: CLASSIC_DIAGNOSTICS_WINDOW_ID,
  })
  if (!contentNodeId) return layoutWithRootNode(layout, bottomNode)

  const rootNode = createSplitNode({
    axis: 'vertical',
    childIds: [contentNodeId, CLASSIC_DIAGNOSTICS_NODE_ID],
    id: classicBottomToolPaneRootNodeId(layout, contentNodeId),
    sizes: [0.74, 0.26],
  })

  return {
    ...layout,
    nodesById: {
      ...layout.nodesById,
      [CLASSIC_DIAGNOSTICS_NODE_ID]: bottomNode,
      [rootNode.id]: rootNode,
    },
    rootNodeId: rootNode.id,
  }
}

function classicBottomToolPaneRootNodeId(
  layout: WorkspaceLayout,
  contentNodeId: LayoutNodeId,
): LayoutNodeId {
  if (contentNodeId !== CLASSIC_ROOT_NODE_ID) return CLASSIC_ROOT_NODE_ID

  return uniqueNodeId(layout, 'classic:root-with-bottom')
}

export function splitWindow(
  layout: WorkspaceLayout,
  input: {
    readonly edge: DropEdge
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
  destination: DropDestination,
): WorkspaceLayout {
  const normalizedLayout = normalizeWorkspaceLayout(layout)
  const surface = normalizedLayout.surfacesById[surfaceId]
  if (!surface) return normalizedLayout
  if (!surfaceCanUseDestination(surface, destination)) return normalizedLayout
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
  destination: DropDestination,
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
): WorkspaceLayout {
  const targetWindow = layout.windowsById[targetWindowId]
  const surface = layout.surfacesById[surfaceId]
  if (!targetWindow || !surface) return layout
  if (!surfaceCanUseDestination(surface, { kind: 'window-center', windowId: targetWindowId })) {
    return layout
  }

  const detachedLayout = removeSurfaceFromOtherWindows(
    removeSurfaceFromRail(layout, surfaceId),
    surfaceId,
    targetWindowId,
  )
  const updatedLayout = addSurfaceToWindow(detachedLayout, surfaceId, targetWindowId, index)
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

export function resizeSplit(
  layout: WorkspaceLayout,
  splitId: LayoutNodeId,
  handleIndex: number,
  deltaPx: number,
): WorkspaceLayout {
  const normalizedLayout = normalizeWorkspaceLayout(layout)
  const split = normalizedLayout.nodesById[splitId]
  if (!split || split.kind !== 'split') return normalizedLayout
  if (handleIndex < 0 || handleIndex >= split.childIds.length - 1) return normalizedLayout

  const sizes = resizeAdjacentSizes(split.sizes, handleIndex, deltaPx)

  return normalizeWorkspaceLayout({
    ...normalizedLayout,
    nodesById: {
      ...normalizedLayout.nodesById,
      [splitId]: {
        ...split,
        sizes,
      },
    },
  })
}

export function maximizeWindow(layout: WorkspaceLayout, windowId: WindowId): WorkspaceLayout {
  return setWindowMode(layout, windowId, 'maximized')
}

export function restoreWindow(layout: WorkspaceLayout, windowId: WindowId): WorkspaceLayout {
  return setWindowMode(layout, windowId, 'normal')
}

export function applyRecipe(layout: WorkspaceLayout, recipeId: RecipeId): WorkspaceLayout {
  const normalizedLayout = normalizeWorkspaceLayout(layout)
  const recipe = normalizedLayout.recipesById[recipeId]
  if (!recipe) return normalizedLayout

  const rootNodeId = recipe.resetRootNodeId
  const nextRootNodeId =
    rootNodeId && normalizedLayout.nodesById[rootNodeId] ? rootNodeId : normalizedLayout.rootNodeId

  return normalizeWorkspaceLayout({
    ...normalizedLayout,
    activeRecipeId: recipeId,
    rail: {
      ...normalizedLayout.rail,
      recipeIds: normalizedLayout.rail.recipeIds.includes(recipeId)
        ? normalizedLayout.rail.recipeIds
        : normalizedLayout.rail.recipeIds.concat(recipeId),
    },
    rootNodeId: nextRootNodeId,
  })
}

export function applyCustomWindowCommand(
  layout: WorkspaceLayout,
  command: CustomWindowManagementCommand,
  targetWindowId?: WindowId,
  nowMs = 0,
): WorkspaceLayout {
  const normalizedLayout = normalizeWorkspaceLayout(layout)
  if (!command.enabled) return normalizedLayout

  const windowId = targetWindowId ?? normalizedLayout.activeWindowId
  if (!windowId) return normalizedLayout
  if (!normalizedLayout.windowsById[windowId]) return normalizedLayout

  const selection = selectCommandFrame(normalizedLayout, command, windowId, nowMs)
  const layoutWithFrame = applyFrameToWindow(normalizedLayout, windowId, selection.frame)

  return normalizeWorkspaceLayout({
    ...layoutWithFrame,
    commandCycleState: selection.cycleState,
  })
}

export function applyLayoutCommand(
  layout: WorkspaceLayout,
  command: WorkspaceLayoutCommand,
): WorkspaceLayout {
  const normalizedLayout = normalizeWorkspaceLayout(layout)
  if (!command.enabled) return normalizedLayout

  let nextLayout = normalizedLayout
  for (const slot of command.slots) {
    nextLayout = applyLayoutCommandSlot(nextLayout, slot)
  }

  return normalizeWorkspaceLayout(nextLayout)
}

function applyLayoutCommandSlot(
  layout: WorkspaceLayout,
  slot: LayoutCommandSurfaceSlot,
): WorkspaceLayout {
  const surface = surfaceForLayoutCommandSlot(slot)
  if (!surface) return layout

  return openSurface(layout, {
    ...surface,
    placement: slot.displayHint ?? placementHintForFrame(layout, slot.frame),
  })
}

function surfaceForLayoutCommandSlot(slot: LayoutCommandSurfaceSlot): Surface | null {
  if (slot.surfaceType === 'file-editor') return fileEditorSurfaceForSlot(slot)
  if (slot.surfaceType === 'diff') return diffSurfaceForSlot(slot)
  if (slot.surfaceType === 'search-results') return createSearchResultsSurface()
  if (slot.surfaceType === 'terminal') return terminalSurfaceForSlot(slot)
  if (slot.surfaceType === 'file-navigator') return createFileNavigatorSurface()
  if (slot.surfaceType === 'git-changes') return createGitChangesSurface()
  if (slot.surfaceType === 'chat') return createChatSurface()
  if (slot.surfaceType === 'logs') return createLogsSurface()
  if (slot.surfaceType === 'diagnostics') return createDiagnosticsSurface()
  if (slot.surfaceType === 'placeholder') return placeholderSurfaceForSlot(slot)

  return null
}

function fileEditorSurfaceForSlot(slot: LayoutCommandSurfaceSlot): Surface | null {
  const path = slot.resourceKey ?? filePayloadValue(slot)
  if (!path) return null

  return createFileEditorSurface({ path })
}

function diffSurfaceForSlot(slot: LayoutCommandSurfaceSlot): Surface | null {
  if (!slot.resourceKey) return null

  return createDiffSurface({ diffDocumentId: slot.resourceKey })
}

function terminalSurfaceForSlot(slot: LayoutCommandSurfaceSlot): Surface {
  return createTerminalSurface({ sessionId: slot.stateKey ?? slot.resourceKey ?? slot.id })
}

function placeholderSurfaceForSlot(slot: LayoutCommandSurfaceSlot): Surface {
  return createPlaceholderSurface({
    contextKey: slot.stateKey ?? slot.resourceKey ?? slot.id,
    title: slot.resourceKey ?? slot.id,
  })
}

function filePayloadValue(slot: LayoutCommandSurfaceSlot) {
  if (slot.payload?.kind !== 'file') return null

  return slot.payload.value
}

function selectCommandFrame(
  layout: WorkspaceLayout,
  command: CustomWindowManagementCommand,
  targetWindowId: WindowId,
  nowMs: number,
) {
  const cycleRule = command.cycleRule
  if (!cycleRule || cycleRule.steps.length === 0) {
    return { cycleState: undefined, frame: command.targetFrame }
  }

  const scopeKey = commandCycleScopeKey(layout, cycleRule.scope, targetWindowId)
  const stepIndex = nextCycleStepIndex(layout, command, scopeKey, nowMs)

  return {
    cycleState: {
      commandId: command.id,
      scopeKey,
      stepIndex,
      updatedAtMs: nowMs,
    },
    frame: cycleRule.steps[stepIndex] ?? command.targetFrame,
  }
}

function nextCycleStepIndex(
  layout: WorkspaceLayout,
  command: CustomWindowManagementCommand,
  scopeKey: string,
  nowMs: number,
) {
  const state = layout.commandCycleState
  if (!state) return 0
  if (state.commandId !== command.id) return 0
  if (state.scopeKey !== scopeKey) return 0
  if (cycleTimedOut(command, state.updatedAtMs, nowMs)) return 0

  return (state.stepIndex + 1) % (command.cycleRule?.steps.length ?? 1)
}

function cycleTimedOut(command: CustomWindowManagementCommand, updatedAtMs: number, nowMs: number) {
  const resetMs = command.cycleRule?.resetMs
  if (resetMs === undefined) return false

  return nowMs - updatedAtMs > resetMs
}

function commandCycleScopeKey(
  layout: WorkspaceLayout,
  scope: 'surface' | 'window' | 'workspace',
  targetWindowId: WindowId,
) {
  if (scope === 'workspace') return 'workspace'
  if (scope === 'window') return targetWindowId

  return layout.windowsById[targetWindowId]?.activeSurfaceId ?? targetWindowId
}

function applyFrameToWindow(
  layout: WorkspaceLayout,
  windowId: WindowId,
  frame: CustomWindowFrame,
): WorkspaceLayout {
  if (frameMaximizes(frame)) return maximizeWindow(layout, windowId)

  const edge = edgeForFrameAnchor(frame.anchor)
  const layoutWithNormalMode = layoutWithWindowMode(layout, windowId, 'normal')
  if (!edge) return layoutWithNormalMode

  return moveWindow(layoutWithNormalMode, windowId, { edge, kind: 'root-edge' })
}

function placementHintForFrame(
  layout: WorkspaceLayout,
  frame: CustomWindowFrame,
): SurfacePlacementHint {
  const edge = edgeForFrameAnchor(frame.anchor)
  if (edge) return { edge, kind: 'root-edge' }
  if (layout.activeWindowId) return { kind: 'active-window' }

  return { edge: 'right', kind: 'root-edge' }
}

function edgeForFrameAnchor(anchor: CustomWindowFrame['anchor']): DropEdge | null {
  if (anchor.includes('left')) return 'left'
  if (anchor.includes('right')) return 'right'
  if (anchor.includes('top')) return 'top'
  if (anchor.includes('bottom')) return 'bottom'

  return null
}

function frameMaximizes(frame: CustomWindowFrame) {
  if (frame.unit !== 'percent') return false
  if (frame.anchor !== 'center') return false

  return frame.width >= 95 && frame.height >= 95
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
    return tabSurfaceInLayout(layout, surfaceId, destination.windowId, destination.tabIndex)
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
  destination: DropDestination,
  options: { readonly recordStickyPlacement: boolean } = { recordStickyPlacement: true },
): WorkspaceLayout {
  const surface = layout.surfacesById[surfaceId]
  if (!surface) return layout
  if (!surfaceCanUseDestination(surface, destination)) return layout

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
): DropDestination | null {
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
    return activeWindowDestination(layout) ?? destinationForPlacement(layout, placement)
  }

  return destinationForPlacement(layout, placement)
}

function destinationForRecipeSlot(
  layout: WorkspaceLayout,
  slot: WorkspaceRecipeSlot,
): DropDestination | null {
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
  destination: Extract<DropDestination, { readonly kind: 'recipe-slot' }>,
) {
  return destinationForRecipeSlot(layout, destination.slot) ?? ({ kind: 'background' } as const)
}

function normalizeToolPaneRecipeLayout(layout: WorkspaceLayout): WorkspaceLayout {
  const bottomPreparedLayout = layoutWithRecipeBottomToolPane(layout)
  const toolWindowIds = managedLeftToolWindowIds(bottomPreparedLayout)
  if (toolWindowIds.length === 0) return bottomPreparedLayout

  const tree = recipePackedTree(bottomPreparedLayout, toolWindowIds)
  if (!tree) return bottomPreparedLayout

  return normalizeWorkspaceLayout({
    ...bottomPreparedLayout,
    nodesById: tree.nodesById,
    rootNodeId: tree.nodeId,
  })
}

function layoutWithRecipeBottomToolPane(layout: WorkspaceLayout): WorkspaceLayout {
  const terminal = createTerminalSurface({ sessionId: 'terminal-1' })
  if (!recipeShouldShowClassicBottomToolPane(layout, terminal.id)) return layout

  return showClassicBottomToolPaneLayout(layout, terminal.id)
}

function recipeShouldShowClassicBottomToolPane(layout: WorkspaceLayout, terminalId: SurfaceId) {
  const terminalWindowId = findWindowIdContainingSurface(layout, terminalId)
  if (!terminalWindowId) return false
  if (terminalWindowId === CLASSIC_DIAGNOSTICS_WINDOW_ID) return false
  if (surfaceHasValidStickyPlacement(layout, terminalId)) return false

  return normalRecipeSurfaceIsVisible(layout)
}

function normalRecipeSurfaceIsVisible(layout: WorkspaceLayout) {
  for (const surfaceId of visibleSurfaceIdsInOrder(layout)) {
    const surface = layout.surfacesById[surfaceId]
    if (!surface) continue
    if (surface.type === 'terminal' || surface.type === 'diagnostics') continue

    return true
  }

  return false
}

function managedLeftToolWindowIds(layout: WorkspaceLayout) {
  const windowIds: WindowId[] = []
  const seen = new Set<WindowId>()

  for (const type of RECIPE_LEFT_TOOL_SURFACE_TYPES) {
    appendManagedLeftToolWindowId(layout, type, windowIds, seen)
  }

  return windowIds
}

function appendManagedLeftToolWindowId(
  layout: WorkspaceLayout,
  type: SurfaceType,
  windowIds: WindowId[],
  seen: Set<WindowId>,
) {
  const surface = Object.values(layout.surfacesById).find((candidate) => candidate.type === type)
  if (!surface) return
  if (surfaceHasValidStickyPlacement(layout, surface.id)) return
  if (recipeSlotForSurface(layout, surface) !== 'left-tool-pane') return

  const windowId = findWindowIdContainingSurface(layout, surface.id)
  if (!windowId) return
  if (seen.has(windowId)) return
  if (windowHasManualPlacementDependent(layout, windowId)) return

  seen.add(windowId)
  windowIds.push(windowId)
}

function surfaceHasValidStickyPlacement(layout: WorkspaceLayout, surfaceId: SurfaceId) {
  const surface = layout.surfacesById[surfaceId]
  if (!surface) return false

  return placementCanRestoreSurface(layout, stickyPlacementForSurface(layout, surfaceId), surface)
}

function windowHasManualPlacementDependent(layout: WorkspaceLayout, windowId: WindowId) {
  for (const surface of Object.values(layout.surfacesById)) {
    if (!surfaceHasValidStickyPlacement(layout, surface.id)) continue
    if (!stickyPlacementTargetsWindow(layout, surface.id, windowId)) continue

    return true
  }

  return false
}

function stickyPlacementTargetsWindow(
  layout: WorkspaceLayout,
  surfaceId: SurfaceId,
  windowId: WindowId,
) {
  if (layout.windowsById[windowId]?.surfaceIds.includes(surfaceId)) return false

  const placement = stickyPlacementForSurface(layout, surfaceId)
  if (placement?.kind === 'window-center') return placement.windowId === windowId
  if (placement?.kind === 'window-edge') return placement.windowId === windowId

  return false
}

function recipePackedTree(layout: WorkspaceLayout, toolWindowIds: readonly WindowId[]) {
  const bottomWindowId = visibleRecipeBottomWindowId(layout)
  const excludedWindowIds = new Set([...toolWindowIds, CLASSIC_DIAGNOSTICS_WINDOW_ID])
  const allocator = createRecipeNodeAllocator(layout)
  const leftTree = stackedWindowTree(allocator, toolWindowIds, 'recipe:left-tool-pane')
  const mainTree = mainContentTree(layout, excludedWindowIds, allocator)
  const bottomTree = bottomWindowId ? windowTree(bottomWindowId, CLASSIC_DIAGNOSTICS_NODE_ID) : null
  const mainPanelTree = recipeMainPanelTree(layout, mainTree, bottomTree, allocator)

  return recipeContentTree(layout, leftTree, mainPanelTree, allocator)
}

function createRecipeNodeAllocator(layout: WorkspaceLayout): RecipeNodeAllocator {
  const usedNodeIds = new Set(Object.keys(layout.nodesById) as LayoutNodeId[])

  return {
    nodeId: (key) => {
      const nodeId = allocatedRecipeNodeId(usedNodeIds, key)
      usedNodeIds.add(nodeId)

      return nodeId
    },
  }
}

function allocatedRecipeNodeId(usedNodeIds: ReadonlySet<LayoutNodeId>, key: string) {
  const firstId = layoutNodeId(key)
  if (!usedNodeIds.has(firstId)) return firstId

  for (let index = 2; index < 1000; index += 1) {
    const candidate = layoutNodeId(`${key}:${index}`)
    if (!usedNodeIds.has(candidate)) return candidate
  }

  throw new Error(`Unable to allocate recipe node id for ${key}`)
}

function visibleRecipeBottomWindowId(layout: WorkspaceLayout): WindowId | null {
  if (!findNodeIdForWindow(layout, CLASSIC_DIAGNOSTICS_WINDOW_ID)) return null

  return CLASSIC_DIAGNOSTICS_WINDOW_ID
}

function stackedWindowTree(
  allocator: RecipeNodeAllocator,
  windowIds: readonly WindowId[],
  nodeKey: string,
) {
  const windowTrees = windowIds.map((windowId) =>
    windowTree(windowId, allocator.nodeId(`${nodeKey}:window:${windowId}`)),
  )
  if (windowTrees.length === 0) return null
  if (windowTrees.length === 1) return windowTrees[0]

  return splitTree({
    axis: 'vertical',
    id: allocator.nodeId(nodeKey),
    sizes: balancedSplitSizes(windowTrees.length),
    trees: windowTrees,
  })
}

function windowTree(windowId: WindowId, nodeId: LayoutNodeId): RecipeTree {
  return {
    nodeId,
    nodesById: {
      [nodeId]: createWindowNode({ id: nodeId, windowId }),
    },
  }
}

function compactTreeWithoutWindows(
  layout: WorkspaceLayout,
  excludedWindowIds: ReadonlySet<WindowId>,
) {
  if (!layout.rootNodeId) return null

  return compactNodeWithoutWindows(layout, layout.rootNodeId, excludedWindowIds, new Set())
}

function mainContentTree(
  layout: WorkspaceLayout,
  excludedWindowIds: ReadonlySet<WindowId>,
  allocator: RecipeNodeAllocator,
) {
  const compactTree = compactTreeWithoutWindows(layout, excludedWindowIds)
  const compactWindowIds = compactTree
    ? windowIdsInRecipeTree(layout, compactTree)
    : new Set<WindowId>()
  const missingWindowIds = unmanagedWindowIds(layout, excludedWindowIds, compactWindowIds)
  if (missingWindowIds.length === 0) return compactTree

  const missingTree = stackedWindowTree(allocator, missingWindowIds, 'recipe:main:missing')
  if (!compactTree) return missingTree
  if (!missingTree) return compactTree

  return splitTree({
    axis: 'horizontal',
    id: allocator.nodeId('recipe:main:recovered'),
    sizes: balancedSplitSizes(2),
    trees: [compactTree, missingTree],
  })
}

function windowIdsInRecipeTree(layout: WorkspaceLayout, tree: RecipeTree) {
  const windowIds = new Set<WindowId>()

  for (const node of Object.values(tree.nodesById)) {
    if (node.kind !== 'window') continue
    if (!layout.windowsById[node.windowId]) continue

    windowIds.add(node.windowId)
  }

  return windowIds
}

function unmanagedWindowIds(
  layout: WorkspaceLayout,
  excludedWindowIds: ReadonlySet<WindowId>,
  existingWindowIds: ReadonlySet<WindowId>,
) {
  const windowIds: WindowId[] = []

  for (const window of Object.values(layout.windowsById)) {
    if (excludedWindowIds.has(window.id)) continue
    if (existingWindowIds.has(window.id)) continue
    if (window.surfaceIds.length === 0) continue

    windowIds.push(window.id)
  }

  return windowIds
}

function compactNodeWithoutWindows(
  layout: WorkspaceLayout,
  nodeId: LayoutNodeId,
  excludedWindowIds: ReadonlySet<WindowId>,
  seenNodeIds: Set<LayoutNodeId>,
): RecipeTree | null {
  if (seenNodeIds.has(nodeId)) return null

  const node = layout.nodesById[nodeId]
  if (!node) return null
  if (node.kind === 'window') return compactWindowNode(node, excludedWindowIds)

  return compactSplitNode(layout, node, excludedWindowIds, new Set(seenNodeIds).add(nodeId))
}

function compactWindowNode(
  node: Extract<LayoutNode, { readonly kind: 'window' }>,
  excludedWindowIds: ReadonlySet<WindowId>,
) {
  if (excludedWindowIds.has(node.windowId)) return null

  return {
    nodeId: node.id,
    nodesById: {
      [node.id]: node,
    },
  } satisfies RecipeTree
}

function compactSplitNode(
  layout: WorkspaceLayout,
  node: Extract<LayoutNode, { readonly kind: 'split' }>,
  excludedWindowIds: ReadonlySet<WindowId>,
  seenNodeIds: Set<LayoutNodeId>,
) {
  const children = compactSplitChildren(layout, node, excludedWindowIds, seenNodeIds)
  if (children.length === 0) return null
  if (children.length === 1) return children[0]?.tree ?? null

  return splitTree({
    axis: node.axis,
    id: node.id,
    sizes: repairSplitSizes(
      children.map((child) => child.size),
      children.length,
    ),
    trees: children.map((child) => child.tree),
  })
}

function compactSplitChildren(
  layout: WorkspaceLayout,
  node: Extract<LayoutNode, { readonly kind: 'split' }>,
  excludedWindowIds: ReadonlySet<WindowId>,
  seenNodeIds: Set<LayoutNodeId>,
) {
  const sizes = repairSplitSizes(node.sizes, node.childIds.length)
  const children: { readonly size: number; readonly tree: RecipeTree }[] = []

  for (const [index, childId] of node.childIds.entries()) {
    const tree = compactNodeWithoutWindows(layout, childId, excludedWindowIds, seenNodeIds)
    if (!tree) continue

    children.push({ size: sizes[index] ?? 0, tree })
  }

  return children
}

function recipeContentTree(
  layout: WorkspaceLayout,
  leftTree: RecipeTree | null,
  mainTree: RecipeTree | null,
  allocator: RecipeNodeAllocator,
) {
  if (!leftTree) return mainTree
  if (!mainTree) return leftTree

  return splitTree({
    axis: 'horizontal',
    id: allocator.nodeId('recipe:content'),
    sizes: recipeContentSplitSizes(layout),
    trees: [leftTree, mainTree],
  })
}

function recipeContentSplitSizes(layout: WorkspaceLayout) {
  const firstToolWindowId = managedLeftToolWindowIds(layout)[0]
  const existingLeftNodeId = firstToolWindowId
    ? findNodeIdForWindow(layout, firstToolWindowId)
    : null
  const parentNodeId = existingLeftNodeId ? findParentNodeId(layout, existingLeftNodeId) : null
  const parentNode = parentNodeId ? layout.nodesById[parentNodeId] : null
  if (parentNode?.kind !== 'split') return [0.24, 0.76]
  if (parentNode.axis !== 'horizontal') return [0.24, 0.76]

  return repairSplitSizes(parentNode.sizes, 2)
}

function recipeMainPanelTree(
  layout: WorkspaceLayout,
  mainTree: RecipeTree | null,
  bottomTree: RecipeTree | null,
  allocator: RecipeNodeAllocator,
) {
  if (!mainTree) return bottomTree
  if (!bottomTree) return mainTree

  return splitTree({
    axis: 'vertical',
    id: allocator.nodeId('recipe:main-panel'),
    sizes: recipeMainPanelSplitSizes(layout),
    trees: [mainTree, bottomTree],
  })
}

function recipeMainPanelSplitSizes(layout: WorkspaceLayout) {
  const bottomNodeId = findNodeIdForWindow(layout, CLASSIC_DIAGNOSTICS_WINDOW_ID)
  const parentNodeId = bottomNodeId ? findParentNodeId(layout, bottomNodeId) : null
  const parentNode = parentNodeId ? layout.nodesById[parentNodeId] : null
  if (parentNode?.kind !== 'split') return [0.74, 0.26]
  if (parentNode.axis !== 'vertical') return [0.74, 0.26]

  return repairSplitSizes(parentNode.sizes, 2)
}

function splitTree({
  axis,
  id,
  sizes,
  trees,
}: {
  readonly axis: LayoutSplitNode['axis']
  readonly id: LayoutNodeId
  readonly sizes: readonly number[]
  readonly trees: readonly RecipeTree[]
}): RecipeTree {
  const node = createSplitNode({
    axis,
    childIds: trees.map((tree) => tree.nodeId),
    id,
    sizes,
  })
  const nodesById = mergedRecipeNodes(trees)

  return {
    nodeId: node.id,
    nodesById: {
      ...nodesById,
      [node.id]: node,
    },
  }
}

function mergedRecipeNodes(trees: readonly RecipeTree[]) {
  const nodesById: Record<string, LayoutNode> = {}

  for (const tree of trees) {
    Object.assign(nodesById, tree.nodesById)
  }

  return nodesById
}

function balancedSplitSizes(count: number) {
  return Array.from({ length: count }, () => 1 / count)
}

function destinationForMainViewSlot(layout: WorkspaceLayout): DropDestination | null {
  const mainWindowId = visibleWindowIdForRecipeSlot(layout, 'editor-center')
  if (mainWindowId) return { kind: 'window-center', windowId: mainWindowId }

  const toolWindowIds = visibleWindowIdsForRecipeSlots(layout, ['left-tool-pane'])
  if (toolWindowIds.length > 0) return rootOrActiveDestination(layout, 'right')

  return mainViewFallbackDestination(layout)
}

function destinationForToolPaneSlot(
  layout: WorkspaceLayout,
  slot: Extract<WorkspaceRecipeSlot, 'left-tool-pane'>,
): DropDestination | null {
  const sameSlotWindowIds = visibleWindowIdsForRecipeSlots(layout, [slot])
  if (sameSlotWindowIds.length > 0) return toolPaneSameSlotDestination(sameSlotWindowIds)

  return rootOrActiveDestination(layout, 'left')
}

function toolPaneSameSlotDestination(windowIds: readonly WindowId[]): DropDestination | null {
  const targetWindowId = targetToolWindowId(windowIds)
  if (!targetWindowId) return null

  return { edge: 'bottom', kind: 'window-edge', windowId: targetWindowId }
}

function targetToolWindowId(toolWindowIds: readonly WindowId[]) {
  return toolWindowIds[toolWindowIds.length - 1]
}

function isToolPaneRecipeSlot(slot: WorkspaceRecipeSlot) {
  return slot === 'left-tool-pane'
}

function rootOrActiveDestination(layout: WorkspaceLayout, edge: DropEdge): DropDestination | null {
  if (layout.rootNodeId) return { edge, kind: 'root-edge' }

  return activeWindowDestination(layout)
}

function mainViewFallbackDestination(layout: WorkspaceLayout): DropDestination | null {
  const activeDestination = activeWindowDestination(layout)
  if (activeDestination?.kind !== 'window-center') return activeDestination
  if (activeWindowContainsRecipeSlot(layout, 'bottom'))
    return rootOrActiveDestination(layout, 'top')
  if (activeDestination.windowId !== CLASSIC_DIAGNOSTICS_WINDOW_ID) return activeDestination
  if (layout.rootNodeId) return { edge: 'top', kind: 'root-edge' }

  return null
}

function activeWindowContainsRecipeSlot(layout: WorkspaceLayout, slot: WorkspaceRecipeSlot) {
  const activeWindowId = layout.activeWindowId
  if (!activeWindowId) return false

  return windowContainsRecipeSlot(layout, layout.windowsById[activeWindowId], slot)
}

function activeWindowDestination(
  layout: WorkspaceLayout,
  tabIndex?: number,
): DropDestination | null {
  if (!layout.activeWindowId) return null
  if (!layoutHasVisibleWindow(layout, layout.activeWindowId)) return null

  return { kind: 'window-center', tabIndex, windowId: layout.activeWindowId }
}

function layoutHasVisibleWindow(layout: WorkspaceLayout, windowId: WindowId) {
  return visibleWindowIdsInOrder(layout).includes(windowId)
}

function visibleWindowIdForRecipeSlot(layout: WorkspaceLayout, slot: WorkspaceRecipeSlot) {
  return visibleWindowIdsForRecipeSlots(layout, [slot])[0] ?? null
}

function visibleWindowIdsForRecipeSlots(
  layout: WorkspaceLayout,
  slots: readonly WorkspaceRecipeSlot[],
) {
  const windowIds: WindowId[] = []

  for (const windowId of visibleWindowIdsInOrder(layout)) {
    const window = layout.windowsById[windowId]
    if (!windowContainsAnyRecipeSlot(layout, window, slots)) continue

    windowIds.push(windowId)
  }

  return windowIds
}

function windowContainsAnyRecipeSlot(
  layout: WorkspaceLayout,
  window: WorkbenchWindow | undefined,
  slots: readonly WorkspaceRecipeSlot[],
) {
  for (const slot of slots) {
    if (windowContainsRecipeSlot(layout, window, slot)) return true
  }

  return false
}

function windowContainsRecipeSlot(
  layout: WorkspaceLayout,
  window: WorkbenchWindow | undefined,
  slot: WorkspaceRecipeSlot,
) {
  if (!window) return false

  return window.surfaceIds.some((surfaceId) => {
    const surface = layout.surfacesById[surfaceId]
    if (!surface) return false

    return recipeSlotForSurface(layout, surface) === slot
  })
}

function recipeSlotForSurface(layout: WorkspaceLayout, surface: Surface): WorkspaceRecipeSlot {
  return (
    layout.recipesById[layout.activeRecipeId]?.surfaceSlots[surface.type] ??
    surface.capabilities.defaultRecipeSlot
  )
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
    return fallbackPlacementForOpen(clearStickyPlacement(layout, surface.id, policyId), surface)
  }

  return fallbackPlacementForOpen(layout, surface)
}

function fallbackPlacementForOpen(layout: WorkspaceLayout, surface: Surface): PlacementResolution {
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

  const previewCleanup = removeReplacedPreview(layout, window, surface)
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

function removeReplacedPreview(
  layout: WorkspaceLayout,
  window: WorkbenchWindow,
  surface: Surface,
): WorkspaceLayout {
  if (surface.lifecycle !== 'transient') return layout
  if (!window.previewSurfaceId) return layout
  if (window.previewSurfaceId === surface.id) return layout

  const previewSurface = layout.surfacesById[window.previewSurfaceId]
  if (previewSurface?.lifecycle !== 'transient') return layout

  return deleteSurfaceFromLayout(layout, previewSurface.id)
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
  destination: DropDestination,
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
  destination: DropDestination,
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
  const windowId = uniqueWindowId(layout, `surface:${surfaceId}`)
  const nodeId = uniqueNodeId(layout, `window:${windowId}`)
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
  destination: DropDestination,
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
  edge: DropEdge,
): WorkspaceLayout {
  const targetNodeId = findNodeIdForWindow(layout, targetWindowId)
  if (!targetNodeId) return insertNodeAtRootEdge(layout, node, edge)

  return insertNodeAroundTarget(layout, node, targetNodeId, edge)
}

function insertNodeAtParentEdge(
  layout: WorkspaceLayout,
  node: LayoutNode,
  targetNodeId: LayoutNodeId,
  edge: DropEdge,
): WorkspaceLayout {
  const parentNodeId = findParentNodeId(layout, targetNodeId)
  if (!parentNodeId) return insertNodeAtRootEdge(layout, node, edge)

  return insertNodeAroundTarget(layout, node, parentNodeId, edge)
}

function insertNodeAtRootEdge(
  layout: WorkspaceLayout,
  node: LayoutNode,
  edge: DropEdge,
): WorkspaceLayout {
  if (!layout.rootNodeId) return layoutWithRootNode(layout, node)
  if (layout.rootNodeId === node.id) return layout

  return insertNodeAroundTarget(layout, node, layout.rootNodeId, edge)
}

function insertNodeAroundTarget(
  layout: WorkspaceLayout,
  node: LayoutNode,
  targetNodeId: LayoutNodeId,
  edge: DropEdge,
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

function insertNodeIntoSplit(
  layout: WorkspaceLayout,
  node: LayoutNode,
  split: LayoutSplitNode,
  targetNodeId: LayoutNodeId,
  edge: DropEdge,
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
  edge: DropEdge,
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
  edge: DropEdge,
): LayoutSplitNode {
  const childIds = isLeadingEdge(edge) ? [insertNodeId, targetNodeId] : [targetNodeId, insertNodeId]

  return {
    axis: edgeAxis(edge),
    childIds,
    id: uniqueNodeId(layout, `split:${edge}:${targetNodeId}:${insertNodeId}`),
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

  return normalizeWorkspaceLayout(mergedLayout)
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
  destination: DropDestination,
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
  destination: DropDestination,
) {
  if (destination.kind === 'window-edge' && destination.windowId === sourceWindowId) return true
  if (destination.kind === 'background' || destination.kind === 'rail') return false
  if (destination.kind === 'recipe-slot') return false

  const nodeId = findNodeIdForWindow(layout, sourceWindowId)
  if (!nodeId || destination.kind !== 'parent-edge') return false

  return isNodeDescendant(layout, nodeId, destination.nodeId)
}

function surfaceCanUseDestination(surface: Surface, destination: DropDestination) {
  return surface.capabilities.validPlacements.includes(destination.kind)
}

function windowCanCollapse(layout: WorkspaceLayout, window: WorkbenchWindow) {
  for (const surfaceId of window.surfaceIds) {
    const surface = layout.surfacesById[surfaceId]
    if (!surface?.capabilities.canCollapse) return false
  }

  return true
}

function surfaceCanClose(surface: Surface) {
  if (!surface.capabilities.canClose) return false
  if (surface.closePolicy.type === 'block') return false

  return true
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
      backgroundSurfaceIds: (layout.rail.backgroundSurfaceIds ?? []).filter(
        (id) => id !== surfaceId,
      ),
    },
  }
}

function deleteSurfaceFromRail(layout: WorkspaceLayout, surfaceId: SurfaceId): WorkspaceLayout {
  return {
    ...layout,
    rail: {
      ...layout.rail,
      backgroundSurfaceIds: (layout.rail.backgroundSurfaceIds ?? []).filter(
        (id) => id !== surfaceId,
      ),
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
  destination: DropDestination,
): WorkspaceLayout {
  const placement = placementFromDestination(destination)
  if (!placement) return layout

  return setStickyPlacement(layout, surfaceId, placement)
}

function recordStickyPlacementsForWindow(
  layout: WorkspaceLayout,
  window: WorkbenchWindow,
  destination: DropDestination,
) {
  let nextLayout = layout

  for (const surfaceId of window.surfaceIds) {
    nextLayout = recordStickyPlacement(nextLayout, surfaceId, destination)
  }

  return nextLayout
}

function placementFromDestination(destination: DropDestination): SurfacePlacementHint | null {
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

function stickyPlacementForSurface(
  layout: WorkspaceLayout,
  surfaceId: SurfaceId,
  policyId?: LayoutPolicyId,
) {
  const policy = policyId ? layout.policiesById[policyId] : policyForStickyPlacement(layout)

  return policy?.stickyPlacementsBySurfaceId[surfaceId]
}

function policyForStickyPlacement(layout: WorkspaceLayout): LayoutPolicyState | null {
  const activeRecipePolicy = Object.values(layout.policiesById).find(
    (policy) => policy.recipeId === layout.activeRecipeId,
  )
  if (activeRecipePolicy) return activeRecipePolicy

  return Object.values(layout.policiesById)[0] ?? null
}

function deleteWindow(layout: WorkspaceLayout, windowId: WindowId): WorkspaceLayout {
  const windowsById = { ...layout.windowsById }
  delete windowsById[windowId]

  return {
    ...layout,
    windowsById,
  }
}

function setWindowMode(
  layout: WorkspaceLayout,
  windowId: WindowId,
  mode: WorkbenchWindow['mode'],
): WorkspaceLayout {
  const normalizedLayout = normalizeWorkspaceLayout(layout)
  const window = normalizedLayout.windowsById[windowId]
  if (!window) return normalizedLayout

  return normalizeWorkspaceLayout(layoutWithWindowMode(normalizedLayout, windowId, mode))
}

function layoutWithWindowMode(
  layout: WorkspaceLayout,
  windowId: WindowId,
  mode: WorkbenchWindow['mode'],
): WorkspaceLayout {
  const window = layout.windowsById[windowId]
  if (!window) return layout

  return {
    ...layout,
    windowsById: {
      ...layout.windowsById,
      [windowId]: {
        ...window,
        mode,
      },
    },
  }
}

function resizeAdjacentSizes(sizes: readonly number[], handleIndex: number, deltaPx: number) {
  const repairedSizes = repairSplitSizes(sizes, sizes.length)
  const delta = deltaPx / RESIZE_REFERENCE_PX
  const left = repairedSizes[handleIndex] ?? 0
  const right = repairedSizes[handleIndex + 1] ?? 0
  const clampedDelta = clampDelta(left, right, delta)
  const nextSizes = repairedSizes.slice()
  nextSizes[handleIndex] = left + clampedDelta
  nextSizes[handleIndex + 1] = right - clampedDelta

  return repairSplitSizes(nextSizes, nextSizes.length)
}

function clampDelta(left: number, right: number, delta: number) {
  const maxPositiveDelta = right - MIN_RESIZE_SIZE
  const maxNegativeDelta = MIN_RESIZE_SIZE - left

  return Math.max(maxNegativeDelta, Math.min(maxPositiveDelta, delta))
}

function validReorder(window: WorkbenchWindow, fromIndex: number, toIndex: number) {
  if (fromIndex < 0 || fromIndex >= window.surfaceIds.length) return false
  if (toIndex < 0 || toIndex >= window.surfaceIds.length) return false

  return true
}

function moveItem<TItem>(items: readonly TItem[], fromIndex: number, toIndex: number) {
  const nextItems = items.slice()
  const [item] = nextItems.splice(fromIndex, 1)
  if (!item) return items

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

function insertAt<TItem>(items: readonly TItem[], item: TItem, index: number) {
  const insertIndex = clampIndex(index, items.length)

  return [...items.slice(0, insertIndex), item, ...items.slice(insertIndex)]
}

function appendUniqueSurfaceIds(
  surfaceIds: readonly SurfaceId[],
  additionalSurfaceIds: readonly SurfaceId[],
) {
  const seen = new Set(surfaceIds)
  const nextSurfaceIds = surfaceIds.slice()

  for (const surfaceId of additionalSurfaceIds) {
    if (seen.has(surfaceId)) continue

    seen.add(surfaceId)
    nextSurfaceIds.push(surfaceId)
  }

  return nextSurfaceIds
}

function clampIndex(index: number, length: number) {
  return Math.max(0, Math.min(index, length))
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

  throw new Error(`Unable to allocate layout id for ${key}`)
}
