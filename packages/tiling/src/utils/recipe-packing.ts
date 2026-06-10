import { createTilingInvariantError } from '@workspace/tiling/utils/structured-errors'
import { balancedSizes } from '@workspace/tiling/utils/geometry-primitives'
import { layoutNodeId } from '@workspace/tiling/utils/layout-ids'
import {
  recipeSlotForSurface,
  stickyPlacementForSurface,
} from '@workspace/tiling/utils/layout-queries'
import { createSplitNode, createWindowNode } from '@workspace/tiling/utils/layout-builders'
import {
  findNodeIdForWindow,
  findParentNodeId,
  normalizeWorkspaceLayout,
  repairSplitSizes,
  visibleWindowIdsInOrder,
} from '@workspace/tiling/utils/layout-normalize'
import type {
  LayoutNode,
  LayoutNodeId,
  LayoutSplitNode,
  Surface,
  SurfaceId,
  SurfacePlacementHint,
  SurfaceType,
  WindowId,
  WorkbenchWindow,
  WorkspaceLayout,
  WorkspaceRecipeSlot,
} from '@workspace/tiling/utils/layout-types'

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

type RecipeLayoutContext = {
  manualPlacementDependentWindowIds?: ReadonlySet<WindowId>
  readonly firstSurfaceByType: ReadonlyMap<SurfaceType, Surface>
  readonly stickyPlacementValidBySurfaceId: Map<SurfaceId, boolean>
  readonly visibleWindowIdBySurfaceId: ReadonlyMap<SurfaceId, WindowId>
  readonly visibleWindowIds: readonly WindowId[]
  readonly visibleWindowIdsSet: ReadonlySet<WindowId>
}

export function placementCanRestoreSurface(
  layout: WorkspaceLayout,
  placement: SurfacePlacementHint | null | undefined,
  surface?: Surface,
  visibleWindowIds?: ReadonlySet<WindowId>,
) {
  if (!placement) return false
  if (surface && !surface.capabilities.validPlacements.includes(placement.kind)) return false
  if (surface && !placementSatisfiesRecipeConstraints(layout, placement, surface)) return false

  switch (placement.kind) {
    case 'active-window':
      return Boolean(
        layout.activeWindowId &&
        layoutWindowIsVisible(layout, layout.activeWindowId, visibleWindowIds),
      )
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
      return layoutWindowIsVisible(layout, placement.windowId, visibleWindowIds)
  }
}

export function normalizeToolPaneRecipeLayout(layout: WorkspaceLayout): WorkspaceLayout {
  const context = recipeLayoutContext(layout)
  const toolWindowIds = managedLeftToolWindowIds(layout, context)
  const bottomWindowId = visibleRecipeBottomWindowId(layout, context)
  if (toolWindowIds.length === 0 && !bottomWindowId) return layout

  const tree = recipePackedTree(layout, toolWindowIds, bottomWindowId)
  if (!tree) return layout

  return normalizeWorkspaceLayout({
    ...layout,
    nodesById: tree.nodesById,
    rootNodeId: tree.nodeId,
  })
}

export function isToolPaneRecipeSlot(slot: WorkspaceRecipeSlot) {
  return slot === 'left-tool-pane'
}

export function visibleWindowIdForRecipeSlot(layout: WorkspaceLayout, slot: WorkspaceRecipeSlot) {
  return visibleWindowIdForRecipeSlotWithContext(layout, slot)
}

export function visibleWindowIdsForRecipeSlots(
  layout: WorkspaceLayout,
  slots: readonly WorkspaceRecipeSlot[],
) {
  return visibleWindowIdsForRecipeSlotsWithContext(layout, slots)
}

export function windowContainsRecipeSlot(
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

function placementSatisfiesRecipeConstraints(
  layout: WorkspaceLayout,
  placement: SurfacePlacementHint,
  surface: Surface,
) {
  if (placement.kind !== 'recipe-slot') return true

  return placement.slot === recipeSlotForSurface(layout, surface)
}

function recipeLayoutContext(layout: WorkspaceLayout): RecipeLayoutContext {
  const visibleWindowIds = visibleWindowIdsInOrder(layout)

  return {
    firstSurfaceByType: firstSurfaceByType(layout),
    stickyPlacementValidBySurfaceId: new Map(),
    visibleWindowIdBySurfaceId: visibleWindowIdBySurfaceId(layout, visibleWindowIds),
    visibleWindowIds,
    visibleWindowIdsSet: new Set(visibleWindowIds),
  }
}

function firstSurfaceByType(layout: WorkspaceLayout) {
  const surfacesByType = new Map<SurfaceType, Surface>()

  for (const surface of Object.values(layout.surfacesById)) {
    if (surfacesByType.has(surface.type)) continue

    surfacesByType.set(surface.type, surface)
  }

  return surfacesByType
}

function visibleWindowIdBySurfaceId(
  layout: WorkspaceLayout,
  visibleWindowIds: readonly WindowId[],
) {
  const windowIdBySurfaceId = new Map<SurfaceId, WindowId>()

  for (const windowId of visibleWindowIds) {
    const window = layout.windowsById[windowId]
    if (!window) continue

    appendSurfaceWindowIds(windowIdBySurfaceId, window, windowId)
  }

  return windowIdBySurfaceId
}

function appendSurfaceWindowIds(
  windowIdBySurfaceId: Map<SurfaceId, WindowId>,
  window: WorkbenchWindow,
  windowId: WindowId,
) {
  for (const surfaceId of window.surfaceIds) {
    if (windowIdBySurfaceId.has(surfaceId)) continue

    windowIdBySurfaceId.set(surfaceId, windowId)
  }
}

function managedLeftToolWindowIds(layout: WorkspaceLayout, context: RecipeLayoutContext) {
  const windowIds: WindowId[] = []
  const seen = new Set<WindowId>()

  for (const type of RECIPE_LEFT_TOOL_SURFACE_TYPES) {
    appendManagedLeftToolWindowId(layout, type, windowIds, seen, context)
  }

  return windowIds
}

function appendManagedLeftToolWindowId(
  layout: WorkspaceLayout,
  type: SurfaceType,
  windowIds: WindowId[],
  seen: Set<WindowId>,
  context: RecipeLayoutContext,
) {
  const surface = context.firstSurfaceByType.get(type)
  if (!surface) return
  if (surfaceHasValidStickyPlacement(layout, surface.id, context)) return
  if (recipeSlotForSurface(layout, surface) !== 'left-tool-pane') return

  const windowId = context.visibleWindowIdBySurfaceId.get(surface.id)
  if (!windowId) return
  if (seen.has(windowId)) return
  if (windowHasManualPlacementDependent(layout, windowId, context)) return

  seen.add(windowId)
  windowIds.push(windowId)
}

function surfaceHasValidStickyPlacement(
  layout: WorkspaceLayout,
  surfaceId: SurfaceId,
  context?: RecipeLayoutContext,
) {
  const surface = layout.surfacesById[surfaceId]
  if (!surface) return false
  if (!context) {
    return placementCanRestoreSurface(layout, stickyPlacementForSurface(layout, surfaceId), surface)
  }
  if (context.stickyPlacementValidBySurfaceId.has(surfaceId)) {
    return context.stickyPlacementValidBySurfaceId.get(surfaceId) ?? false
  }

  const placement = stickyPlacementForSurface(layout, surfaceId)
  const isValid = placementCanRestoreSurface(
    layout,
    placement,
    surface,
    context.visibleWindowIdsSet,
  )
  context.stickyPlacementValidBySurfaceId.set(surfaceId, isValid)

  return isValid
}

function windowHasManualPlacementDependent(
  layout: WorkspaceLayout,
  windowId: WindowId,
  context?: RecipeLayoutContext,
) {
  if (context) return manualPlacementDependentWindowIds(layout, context).has(windowId)

  for (const surface of Object.values(layout.surfacesById)) {
    if (!surfaceHasValidStickyPlacement(layout, surface.id)) continue
    if (!stickyPlacementTargetsWindow(layout, surface.id, windowId)) continue

    return true
  }

  return false
}

function manualPlacementDependentWindowIds(layout: WorkspaceLayout, context: RecipeLayoutContext) {
  if (context.manualPlacementDependentWindowIds) return context.manualPlacementDependentWindowIds

  const windowIds = new Set<WindowId>()
  for (const surface of Object.values(layout.surfacesById)) {
    if (!surfaceHasValidStickyPlacement(layout, surface.id, context)) continue

    const windowId = stickyPlacementTargetWindowId(layout, surface.id)
    if (!windowId) continue
    if (layout.windowsById[windowId]?.surfaceIds.includes(surface.id)) continue

    windowIds.add(windowId)
  }

  context.manualPlacementDependentWindowIds = windowIds

  return windowIds
}

function stickyPlacementTargetsWindow(
  layout: WorkspaceLayout,
  surfaceId: SurfaceId,
  windowId: WindowId,
) {
  if (layout.windowsById[windowId]?.surfaceIds.includes(surfaceId)) return false

  return stickyPlacementTargetWindowId(layout, surfaceId) === windowId
}

function stickyPlacementTargetWindowId(layout: WorkspaceLayout, surfaceId: SurfaceId) {
  const placement = stickyPlacementForSurface(layout, surfaceId)
  if (placement?.kind === 'window-center') return placement.windowId
  if (placement?.kind === 'window-edge') return placement.windowId

  return null
}

function recipePackedTree(
  layout: WorkspaceLayout,
  toolWindowIds: readonly WindowId[],
  bottomWindowId: WindowId | null,
) {
  const bottomWindowIds = bottomWindowId ? [bottomWindowId] : []
  const excludedWindowIds = new Set([...toolWindowIds, ...bottomWindowIds])
  const allocator = createRecipeNodeAllocator(layout)
  const leftTree = stackedWindowTree(allocator, toolWindowIds, 'recipe:left-tool-pane')
  const mainTree = mainContentTree(layout, excludedWindowIds, allocator)
  const bottomTree = bottomWindowId
    ? windowTree(bottomWindowId, allocator.nodeId('recipe:bottom'))
    : null
  const mainPanelTree = recipeMainPanelTree(layout, mainTree, bottomTree, allocator, bottomWindowId)

  return recipeContentTree(layout, leftTree, mainPanelTree, allocator, toolWindowIds)
}

function createRecipeNodeAllocator(layout: WorkspaceLayout): RecipeNodeAllocator {
  const usedNodeIds = new Set(Object.keys(layout.nodesById) as LayoutNodeId[])

  return {
    nodeId: (key) => {
      const nodeId = uniqueRecipeNodeId((candidate) => !usedNodeIds.has(candidate), key)
      usedNodeIds.add(nodeId)

      return nodeId
    },
  }
}

function visibleRecipeBottomWindowId(
  layout: WorkspaceLayout,
  context?: RecipeLayoutContext,
): WindowId | null {
  return visibleWindowIdForRecipeSlotWithContext(layout, 'bottom', context)
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
    sizes: balancedSizes(windowTrees.length),
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
    sizes: balancedSizes(2),
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
  toolWindowIds: readonly WindowId[],
) {
  if (!leftTree) return mainTree
  if (!mainTree) return leftTree

  return splitTree({
    axis: 'horizontal',
    id: allocator.nodeId('recipe:content'),
    sizes: recipeContentSplitSizes(layout, toolWindowIds),
    trees: [leftTree, mainTree],
  })
}

function recipeContentSplitSizes(layout: WorkspaceLayout, toolWindowIds: readonly WindowId[]) {
  const firstToolWindowId = toolWindowIds[0]
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
  bottomWindowId: WindowId | null,
) {
  if (!mainTree) return bottomTree
  if (!bottomTree) return mainTree

  return splitTree({
    axis: 'vertical',
    id: allocator.nodeId('recipe:main-panel'),
    sizes: recipeMainPanelSplitSizes(layout, bottomWindowId),
    trees: [mainTree, bottomTree],
  })
}

function recipeMainPanelSplitSizes(layout: WorkspaceLayout, bottomWindowId: WindowId | null) {
  const bottomNodeId = bottomWindowId ? findNodeIdForWindow(layout, bottomWindowId) : null
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

function layoutHasVisibleWindow(layout: WorkspaceLayout, windowId: WindowId) {
  return visibleWindowIdsInOrder(layout).includes(windowId)
}

function layoutWindowIsVisible(
  layout: WorkspaceLayout,
  windowId: WindowId,
  visibleWindowIds?: ReadonlySet<WindowId>,
) {
  if (visibleWindowIds) return visibleWindowIds.has(windowId)

  return layoutHasVisibleWindow(layout, windowId)
}

function visibleWindowIdForRecipeSlotWithContext(
  layout: WorkspaceLayout,
  slot: WorkspaceRecipeSlot,
  context?: RecipeLayoutContext,
) {
  return visibleWindowIdsForRecipeSlotsWithContext(layout, [slot], context)[0] ?? null
}

function visibleWindowIdsForRecipeSlotsWithContext(
  layout: WorkspaceLayout,
  slots: readonly WorkspaceRecipeSlot[],
  context?: RecipeLayoutContext,
) {
  const windowIds: WindowId[] = []
  const visibleWindowIds = context?.visibleWindowIds ?? visibleWindowIdsInOrder(layout)

  for (const windowId of visibleWindowIds) {
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

function uniqueRecipeNodeId(
  available: (candidate: LayoutNodeId) => boolean,
  key: string,
): LayoutNodeId {
  const firstId = layoutNodeId(key)
  if (available(firstId)) return firstId

  for (let index = 2; index < 1000; index += 1) {
    const candidate = layoutNodeId(`${key}:${index}`)
    if (available(candidate)) return candidate
  }

  throw createTilingInvariantError(`Unable to allocate layout id for ${key}`)
}
