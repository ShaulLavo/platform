import { layoutNodeId, workbenchWindowId } from './layout-ids'
import {
  createDiagnosticsSurface,
  createDiffSurface,
  createFileEditorSurface,
  createFileNavigatorSurface,
  createGitChangesSurface,
  createLogsSurface,
  createPlaceholderSurface,
  createSearchResultsSurface,
  createTerminalSurface,
} from './layout-builders'
import {
  edgeAxis,
  findNodeIdForWindow,
  findParentNodeId,
  findWindowIdContainingSurface,
  isLeadingEdge,
  isNodeDescendant,
  normalizeWorkspaceLayout,
  repairSplitSizes,
} from './layout-normalize'
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
  WorkspaceRecipeSlot,
  WindowId,
  WorkbenchWindow,
  WorkspaceLayout,
  WorkspaceLayoutCommand,
} from './layout-types'

const RESIZE_REFERENCE_PX = 1000
const MIN_RESIZE_SIZE = 0.05

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
    case 'openSurface':
      return openSurface(layout, operation.surface, { policyId: operation.policyId })
    case 'closeSurface':
      return closeSurface(layout, operation.surfaceId)
    case 'minimizeSurface':
      return minimizeSurface(layout, operation.surfaceId)
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
  const placement = placementForOpen(restoredLayout, surfaceToOpen, options.policyId)
  const placedLayout = placeSurface(restoredLayout, surfaceToOpen.id, placement)

  return normalizeWorkspaceLayout(placedLayout)
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

  return normalizeWorkspaceLayout(withoutSurface)
}

export function minimizeSurface(layout: WorkspaceLayout, surfaceId: SurfaceId): WorkspaceLayout {
  const normalizedLayout = normalizeWorkspaceLayout(layout)
  const surface = normalizedLayout.surfacesById[surfaceId]
  if (!surface?.capabilities.canMinimize) return normalizedLayout

  const withoutVisibleSurface = removeSurfaceFromWindows(normalizedLayout, surfaceId)
  const rail = addSurfaceToRail(withoutVisibleSurface, surfaceId, 'minimizedSurfaceIds').rail

  return normalizeWorkspaceLayout({
    ...withoutVisibleSurface,
    rail,
  })
}

export function restoreSurface(
  layout: WorkspaceLayout,
  surfaceId: SurfaceId,
  placement?: SurfacePlacementHint,
): WorkspaceLayout {
  const normalizedLayout = normalizeWorkspaceLayout(layout)
  const surface = normalizedLayout.surfacesById[surfaceId]
  if (!surface) return normalizedLayout

  const placementHint =
    placement ?? stickyPlacementForSurface(normalizedLayout, surfaceId) ?? surface.placement
  const restoredLayout = removeSurfaceFromRail(normalizedLayout, surfaceId)
  const placedLayout = placeSurface(restoredLayout, surfaceId, placementHint)

  return normalizeWorkspaceLayout(placedLayout)
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
  if (destination.kind === 'rail') return minimizeSurface(normalizedLayout, surfaceId)
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
  if (destination.kind === 'rail') return minimizeWindowSurfaces(normalizedLayout, window)
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

  const destination = destinationForPlacement(layout, placement)
  if (!destination) return ensureSurfaceIsVisible(layout, surfaceId)
  if (destination.kind === 'rail') return addSurfaceToRail(layout, surfaceId, 'minimizedSurfaceIds')
  if (destination.kind === 'window-center') {
    return tabSurfaceInLayout(layout, surfaceId, destination.windowId, destination.tabIndex)
  }

  return placeSurfaceAtEdgeDestination(layout, surfaceId, destination)
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
): WorkspaceLayout {
  const surface = layout.surfacesById[surfaceId]
  if (!surface) return layout
  if (!surfaceCanUseDestination(surface, destination)) return layout

  const detachedLayout = removeSurfaceFromWindows(
    removeSurfaceFromRail(layout, surfaceId),
    surfaceId,
  )
  const nextLayout = insertSurfaceWindow(detachedLayout, surfaceId, destination)

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

function destinationForRecipeSlot(
  layout: WorkspaceLayout,
  slot: WorkspaceRecipeSlot,
): DropDestination | null {
  if (slot === 'primary-side') return rootOrActiveDestination(layout, 'left')
  if (slot === 'secondary-side') return rootOrActiveDestination(layout, 'right')
  if (slot === 'bottom') return rootOrActiveDestination(layout, 'bottom')
  if (slot === 'rail') return { kind: 'rail' }

  return activeWindowDestination(layout)
}

function rootOrActiveDestination(layout: WorkspaceLayout, edge: DropEdge): DropDestination | null {
  if (layout.rootNodeId) return { edge, kind: 'root-edge' }

  return activeWindowDestination(layout)
}

function activeWindowDestination(
  layout: WorkspaceLayout,
  tabIndex?: number,
): DropDestination | null {
  if (!layout.activeWindowId) return null
  if (!layout.windowsById[layout.activeWindowId]) return null

  return { kind: 'window-center', tabIndex, windowId: layout.activeWindowId }
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
): SurfacePlacementHint | undefined {
  const stickyPlacement = stickyPlacementForSurface(layout, surface.id, policyId)
  if (stickyPlacement) return stickyPlacement

  return surface.placement
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

  return insertNodeAtDestination(layoutWithWindow, surfaceWindow.node, destination)
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

  return {
    ...layout,
    nodesById: {
      ...nodesById,
      [parentNodeId]: {
        ...parentNode,
        childIds: parentNode.childIds.filter((id) => id !== childNodeId),
        sizes: parentNode.sizes.slice(0, Math.max(0, parentNode.childIds.length - 1)),
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

function minimizeWindowSurfaces(layout: WorkspaceLayout, window: WorkbenchWindow): WorkspaceLayout {
  let nextLayout = layout

  for (const surfaceId of window.surfaceIds) {
    nextLayout = minimizeSurface(nextLayout, surfaceId)
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

  const nodeId = findNodeIdForWindow(layout, sourceWindowId)
  if (!nodeId || destination.kind !== 'parent-edge') return false

  return isNodeDescendant(layout, nodeId, destination.nodeId)
}

function surfaceCanUseDestination(surface: Surface, destination: DropDestination) {
  return surface.capabilities.validPlacements.includes(destination.kind)
}

function surfaceCanClose(surface: Surface) {
  if (!surface.capabilities.canClose) return false
  if (surface.closePolicy.type === 'block') return false

  return true
}

function addSurfaceToRail(
  layout: WorkspaceLayout,
  surfaceId: SurfaceId,
  key: 'minimizedSurfaceIds' | 'runningSurfaceIds',
): WorkspaceLayout {
  if (layout.rail[key].includes(surfaceId)) return layout

  return {
    ...layout,
    rail: {
      ...layout.rail,
      [key]: layout.rail[key].concat(surfaceId),
    },
  }
}

function removeSurfaceFromRail(layout: WorkspaceLayout, surfaceId: SurfaceId): WorkspaceLayout {
  return {
    ...layout,
    rail: {
      ...layout.rail,
      minimizedSurfaceIds: layout.rail.minimizedSurfaceIds.filter((id) => id !== surfaceId),
    },
  }
}

function deleteSurfaceFromRail(layout: WorkspaceLayout, surfaceId: SurfaceId): WorkspaceLayout {
  return {
    ...layout,
    rail: {
      ...layout.rail,
      minimizedSurfaceIds: layout.rail.minimizedSurfaceIds.filter((id) => id !== surfaceId),
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
    case 'rail':
      return { kind: 'rail' }
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

function insertAt<TItem>(items: readonly TItem[], item: TItem, index: number) {
  const insertIndex = clampIndex(index, items.length)

  return [...items.slice(0, insertIndex), item, ...items.slice(insertIndex)]
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
