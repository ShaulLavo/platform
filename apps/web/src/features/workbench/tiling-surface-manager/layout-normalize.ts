import { layoutNodeId, workbenchWindowId } from './layout-ids'
import type {
  LayoutNode,
  LayoutNodeId,
  LayoutSplitAxis,
  LayoutSplitNode,
  LayoutWindowNode,
  RailState,
  Surface,
  SurfaceId,
  WindowId,
  WorkbenchWindow,
  WorkspaceLayout,
  RecipeId,
} from './layout-types'

const MIN_SPLIT_SIZE = 0.05

type TreeNormalizationResult = {
  readonly nodesById: Record<string, LayoutNode>
  readonly rootNodeId: LayoutNodeId | null
  readonly visibleWindowIds: readonly WindowId[]
}

type NormalizedNodeResult = {
  readonly node: LayoutNode
  readonly nodesById: Record<string, LayoutNode>
  readonly visibleWindowIds: readonly WindowId[]
}

type ChildNodeEntry = {
  readonly nodeId: LayoutNodeId
  readonly size: number
}

export function normalizeWorkspaceLayout(layout: WorkspaceLayout): WorkspaceLayout {
  const surfacesById = removeInvalidTransientSurfaces(layout.surfacesById)
  const layoutWithoutInvalidSurfaces = {
    ...layout,
    surfacesById,
  }
  const rail = repairRailState(layoutWithoutInvalidSurfaces)
  const windowsById = repairWindows(layoutWithoutInvalidSurfaces, rail)
  const tree = normalizeTree({
    ...layoutWithoutInvalidSurfaces,
    rail,
    windowsById,
  })
  const visibleLayout = removeDuplicateVisibleSurfaces({
    ...layoutWithoutInvalidSurfaces,
    nodesById: tree.nodesById,
    rail,
    rootNodeId: tree.rootNodeId,
    windowsById,
  })
  const repairedTree = normalizeTree(visibleLayout)
  const layoutWithTree = {
    ...visibleLayout,
    nodesById: repairedTree.nodesById,
    rootNodeId: repairedTree.rootNodeId,
  }
  const layoutWithFallback = ensureFallbackWindow(layoutWithTree, repairedTree.visibleWindowIds)
  const finalTree = normalizeTree(layoutWithFallback)
  const layoutWithOrphans = routeOrphanSurfaces({
    ...layoutWithFallback,
    nodesById: finalTree.nodesById,
    rootNodeId: finalTree.rootNodeId,
  })
  const clampedLayout = clampActiveIds(layoutWithOrphans)

  return {
    ...clampedLayout,
    mruSurfaceIds: repairMruSurfaceIds(clampedLayout),
    mruWindowIds: repairMruWindowIds(clampedLayout),
    rail: repairRailState(clampedLayout),
  }
}

export function visibleWindowIdsInOrder(layout: WorkspaceLayout) {
  return normalizeTree(layout).visibleWindowIds
}

export function visibleSurfaceIdsInOrder(layout: WorkspaceLayout) {
  const surfaceIds: SurfaceId[] = []

  for (const windowId of visibleWindowIdsInOrder(layout)) {
    const window = layout.windowsById[windowId]
    if (!window) continue
    surfaceIds.push(...window.surfaceIds)
  }

  return surfaceIds
}

export function findWindowIdContainingSurface(layout: WorkspaceLayout, surfaceId: SurfaceId) {
  for (const windowId of visibleWindowIdsInOrder(layout)) {
    const window = layout.windowsById[windowId]
    if (!window?.surfaceIds.includes(surfaceId)) continue

    return windowId
  }

  return null
}

export function findNodeIdForWindow(layout: WorkspaceLayout, windowId: WindowId) {
  for (const node of Object.values(layout.nodesById)) {
    if (node.kind !== 'window') continue
    if (node.windowId !== windowId) continue

    return node.id
  }

  return null
}

export function isNodeDescendant(
  layout: WorkspaceLayout,
  ancestorNodeId: LayoutNodeId,
  candidateNodeId: LayoutNodeId,
) {
  if (ancestorNodeId === candidateNodeId) return true

  const ancestor = layout.nodesById[ancestorNodeId]
  if (!ancestor || ancestor.kind === 'window') return false

  for (const childId of ancestor.childIds) {
    if (isNodeDescendant(layout, childId, candidateNodeId)) return true
  }

  return false
}

export function findParentNodeId(layout: WorkspaceLayout, childNodeId: LayoutNodeId) {
  for (const node of Object.values(layout.nodesById)) {
    if (node.kind !== 'split') continue
    if (!node.childIds.includes(childNodeId)) continue

    return node.id
  }

  return null
}

export function edgeAxis(edge: 'bottom' | 'left' | 'right' | 'top'): LayoutSplitAxis {
  if (edge === 'left' || edge === 'right') return 'horizontal'

  return 'vertical'
}

export function isLeadingEdge(edge: 'bottom' | 'left' | 'right' | 'top') {
  return edge === 'left' || edge === 'top'
}

export function repairSplitSizes(sizes: readonly number[], childCount: number) {
  if (childCount === 0) return []

  const repaired = Array.from({ length: childCount }, (_, index) => saneSize(sizes[index]))
  const total = repaired.reduce((sum, size) => sum + size, 0)
  if (total <= 0) return balancedSizes(childCount)

  return repaired.map((size) => size / total)
}

function normalizeTree(layout: WorkspaceLayout): TreeNormalizationResult {
  if (!layout.rootNodeId) return emptyTree()

  const result = normalizeNode(layout, layout.rootNodeId, new Set())
  if (!result) return emptyTree()

  return {
    nodesById: result.nodesById,
    rootNodeId: result.node.id,
    visibleWindowIds: result.visibleWindowIds,
  }
}

function normalizeNode(
  layout: WorkspaceLayout,
  nodeId: LayoutNodeId,
  seenNodeIds: Set<LayoutNodeId>,
): NormalizedNodeResult | null {
  if (seenNodeIds.has(nodeId)) return null

  const node = layout.nodesById[nodeId]
  if (!node) return null

  const nextSeenNodeIds = new Set(seenNodeIds).add(nodeId)
  if (node.kind === 'window') return normalizeWindowNode(layout, node)

  return normalizeSplitNode(layout, node, nextSeenNodeIds)
}

function normalizeWindowNode(
  layout: WorkspaceLayout,
  node: LayoutWindowNode,
): NormalizedNodeResult | null {
  const window = layout.windowsById[node.windowId]
  if (!window) return null
  if (window.surfaceIds.length === 0) return null

  return {
    node,
    nodesById: { [node.id]: node },
    visibleWindowIds: [node.windowId],
  }
}

function normalizeSplitNode(
  layout: WorkspaceLayout,
  node: LayoutSplitNode,
  seenNodeIds: Set<LayoutNodeId>,
): NormalizedNodeResult | null {
  const childResults = collectSplitChildren(layout, node, seenNodeIds)
  if (childResults.entries.length === 0) return null
  if (childResults.entries.length === 1) {
    return onlyChildResult(childResults)
  }

  const normalizedNode = {
    ...node,
    childIds: childResults.entries.map((entry) => entry.nodeId),
    sizes: repairSplitSizes(
      childResults.entries.map((entry) => entry.size),
      childResults.entries.length,
    ),
  }

  return {
    node: normalizedNode,
    nodesById: {
      ...childResults.nodesById,
      [normalizedNode.id]: normalizedNode,
    },
    visibleWindowIds: childResults.visibleWindowIds,
  }
}

function collectSplitChildren(
  layout: WorkspaceLayout,
  node: LayoutSplitNode,
  seenNodeIds: Set<LayoutNodeId>,
) {
  const entries: ChildNodeEntry[] = []
  const nodesById: Record<string, LayoutNode> = {}
  const visibleWindowIds: WindowId[] = []
  const childSizes = repairSplitSizes(node.sizes, node.childIds.length)

  node.childIds.forEach((childId, index) => {
    const childResult = normalizeNode(layout, childId, seenNodeIds)
    if (!childResult) return

    visibleWindowIds.push(...childResult.visibleWindowIds)
    addNormalizedChild(entries, nodesById, childResult, node.axis, childSizes[index] ?? 0)
  })

  return { entries, nodesById, visibleWindowIds }
}

function addNormalizedChild(
  entries: ChildNodeEntry[],
  nodesById: Record<string, LayoutNode>,
  childResult: NormalizedNodeResult,
  parentAxis: LayoutSplitAxis,
  parentSize: number,
) {
  if (childResult.node.kind !== 'split' || childResult.node.axis !== parentAxis) {
    Object.assign(nodesById, childResult.nodesById)
    entries.push({ nodeId: childResult.node.id, size: parentSize })
    return
  }

  const childSizes = repairSplitSizes(childResult.node.sizes, childResult.node.childIds.length)
  for (const [index, childId] of childResult.node.childIds.entries()) {
    entries.push({ nodeId: childId, size: parentSize * (childSizes[index] ?? 0) })
  }

  Object.assign(nodesById, omitNode(childResult.nodesById, childResult.node.id))
}

function onlyChildResult(childResults: {
  readonly entries: readonly ChildNodeEntry[]
  readonly nodesById: Record<string, LayoutNode>
  readonly visibleWindowIds: readonly WindowId[]
}): NormalizedNodeResult | null {
  const childId = childResults.entries[0]?.nodeId
  if (!childId) return null

  const childNode = childResults.nodesById[childId]
  if (!childNode) return null

  return {
    node: childNode,
    nodesById: childResults.nodesById,
    visibleWindowIds: childResults.visibleWindowIds,
  }
}

function repairWindows(layout: WorkspaceLayout, rail: RailState) {
  const minimizedSurfaceIds = new Set(rail.minimizedSurfaceIds)
  const windowsById: Record<string, WorkbenchWindow> = {}

  for (const window of Object.values(layout.windowsById)) {
    const repairedWindow = repairWindow(window, layout.surfacesById, minimizedSurfaceIds)
    if (!repairedWindow) continue

    windowsById[window.id] = repairedWindow
  }

  return windowsById
}

function repairWindow(
  window: WorkbenchWindow,
  surfacesById: WorkspaceLayout['surfacesById'],
  minimizedSurfaceIds: ReadonlySet<SurfaceId>,
): WorkbenchWindow | null {
  const surfaceIds = uniqueSurfaceIds(window.surfaceIds).filter((surfaceId) => {
    if (!surfacesById[surfaceId]) return false

    return !minimizedSurfaceIds.has(surfaceId)
  })
  if (surfaceIds.length === 0) return null

  const activeSurfaceId = surfaceIds.includes(window.activeSurfaceId)
    ? window.activeSurfaceId
    : surfaceIds[0]

  return {
    ...window,
    activeSurfaceId,
    pinnedSurfaceIds: uniqueSurfaceIds(window.pinnedSurfaceIds).filter((surfaceId) =>
      surfaceIds.includes(surfaceId),
    ),
    previewSurfaceId: previewSurfaceIdForWindow(window, surfaceIds),
    surfaceIds,
  }
}

function previewSurfaceIdForWindow(
  window: WorkbenchWindow,
  surfaceIds: readonly SurfaceId[],
): SurfaceId | undefined {
  if (!window.previewSurfaceId) return undefined
  if (!surfaceIds.includes(window.previewSurfaceId)) return undefined

  return window.previewSurfaceId
}

function removeDuplicateVisibleSurfaces(layout: WorkspaceLayout): WorkspaceLayout {
  const seenSurfaceIds = new Set<SurfaceId>()
  const windowsById: Record<string, WorkbenchWindow> = { ...layout.windowsById }

  for (const windowId of visibleWindowIdsInOrder(layout)) {
    const window = layout.windowsById[windowId]
    if (!window) continue

    const repairedWindow = removeDuplicateSurfacesFromWindow(window, seenSurfaceIds)
    if (!repairedWindow) {
      delete windowsById[window.id]
      continue
    }

    windowsById[window.id] = repairedWindow
  }

  return {
    ...layout,
    windowsById,
  }
}

function removeDuplicateSurfacesFromWindow(
  window: WorkbenchWindow,
  seenSurfaceIds: Set<SurfaceId>,
): WorkbenchWindow | null {
  const surfaceIds = window.surfaceIds.filter((surfaceId) => {
    if (seenSurfaceIds.has(surfaceId)) return false

    seenSurfaceIds.add(surfaceId)
    return true
  })
  if (surfaceIds.length === 0) return null

  const activeSurfaceId = surfaceIds.includes(window.activeSurfaceId)
    ? window.activeSurfaceId
    : surfaceIds[0]

  return {
    ...window,
    activeSurfaceId,
    pinnedSurfaceIds: window.pinnedSurfaceIds.filter((surfaceId) => surfaceIds.includes(surfaceId)),
    previewSurfaceId: previewSurfaceIdForWindow(window, surfaceIds),
    surfaceIds,
  }
}

function ensureFallbackWindow(
  layout: WorkspaceLayout,
  visibleWindowIds: readonly WindowId[],
): WorkspaceLayout {
  if (visibleWindowIds.length > 0) return layout

  const fallbackSurface = fallbackSurfaceForLayout(layout)
  if (!fallbackSurface) return layout

  const windowId = workbenchWindowId(`fallback:${fallbackSurface.id}`)
  const nodeId = layoutNodeId(`fallback:${fallbackSurface.id}`)
  const window = {
    activeSurfaceId: fallbackSurface.id,
    id: windowId,
    mode: 'normal',
    pinnedSurfaceIds: [],
    surfaceIds: [fallbackSurface.id],
  }
  const node = {
    id: nodeId,
    kind: 'window',
    windowId,
  } satisfies LayoutWindowNode

  return {
    ...layout,
    activeSurfaceId: fallbackSurface.id,
    activeWindowId: windowId,
    nodesById: { [nodeId]: node },
    rootNodeId: nodeId,
    windowsById: { [windowId]: window },
  }
}

function fallbackSurfaceForLayout(layout: WorkspaceLayout) {
  const railSurfaceIds = new Set([
    ...layout.rail.minimizedSurfaceIds,
    ...layout.rail.runningSurfaceIds,
  ])
  const preferredSurfaceIds = uniqueSurfaceIds([
    ...(layout.activeSurfaceId ? [layout.activeSurfaceId] : []),
    ...layout.mruSurfaceIds,
    ...Object.values(layout.surfacesById).map((surface) => surface.id),
  ])

  for (const surfaceId of preferredSurfaceIds) {
    const surface = layout.surfacesById[surfaceId]
    if (!surface) continue
    if (railSurfaceIds.has(surfaceId)) continue
    if (!canFallbackSurface(surface)) continue

    return surface
  }

  return null
}

function canFallbackSurface(surface: Surface) {
  return (
    surface.lifecycle === 'durable' ||
    surface.lifecycle === 'placeholder' ||
    surface.lifecycle === 'running'
  )
}

function routeOrphanSurfaces(layout: WorkspaceLayout): WorkspaceLayout {
  const visibleSurfaceIds = new Set(visibleSurfaceIdsInOrder(layout))
  const surfacesById: Record<string, Surface> = {}
  let rail = layout.rail

  for (const surface of Object.values(layout.surfacesById)) {
    if (visibleSurfaceIds.has(surface.id)) {
      surfacesById[surface.id] = surface
      continue
    }

    const routed = routeOrphanSurface(surface, rail)
    if (!routed) continue

    rail = routed.rail
    surfacesById[surface.id] = surface
  }

  return {
    ...layout,
    rail,
    surfacesById,
  }
}

function routeOrphanSurface(surface: Surface, rail: RailState) {
  if (surface.lifecycle === 'transient') return null
  if (surface.lifecycle === 'placeholder') return null
  if (surface.lifecycle === 'running') {
    return { rail: addRailSurface(rail, 'runningSurfaceIds', surface.id) }
  }

  return { rail: addRailSurface(rail, 'minimizedSurfaceIds', surface.id) }
}

function clampActiveIds(layout: WorkspaceLayout): WorkspaceLayout {
  const windowsById = repairWindowActiveSurfaces(layout)
  const layoutWithWindows = {
    ...layout,
    windowsById,
  }
  const visibleWindowIds = visibleWindowIdsInOrder(layoutWithWindows)
  const activeWindowId = activeWindowIdForLayout(layoutWithWindows, visibleWindowIds)
  const activeSurfaceId = activeSurfaceIdForLayout(layoutWithWindows, activeWindowId)

  return {
    ...layoutWithWindows,
    activeSurfaceId,
    activeWindowId,
  }
}

function repairWindowActiveSurfaces(layout: WorkspaceLayout) {
  const windowsById: Record<string, WorkbenchWindow> = {}

  for (const window of Object.values(layout.windowsById)) {
    if (window.surfaceIds.includes(window.activeSurfaceId)) {
      windowsById[window.id] = window
      continue
    }

    const activeSurfaceId = window.surfaceIds[0]
    if (!activeSurfaceId) continue

    windowsById[window.id] = { ...window, activeSurfaceId }
  }

  return windowsById
}

function activeWindowIdForLayout(
  layout: WorkspaceLayout,
  visibleWindowIds: readonly WindowId[],
): WindowId | undefined {
  if (layout.activeWindowId && visibleWindowIds.includes(layout.activeWindowId)) {
    return layout.activeWindowId
  }

  const activeSurfaceWindowId = windowIdForActiveSurface(layout, visibleWindowIds)
  if (activeSurfaceWindowId) return activeSurfaceWindowId

  return firstMruWindowId(layout, visibleWindowIds) ?? visibleWindowIds[0]
}

function windowIdForActiveSurface(
  layout: WorkspaceLayout,
  visibleWindowIds: readonly WindowId[],
): WindowId | null {
  if (!layout.activeSurfaceId) return null

  for (const windowId of visibleWindowIds) {
    const window = layout.windowsById[windowId]
    if (!window?.surfaceIds.includes(layout.activeSurfaceId)) continue

    return windowId
  }

  return null
}

function firstMruWindowId(
  layout: WorkspaceLayout,
  visibleWindowIds: readonly WindowId[],
): WindowId | null {
  for (const windowId of layout.mruWindowIds) {
    if (!visibleWindowIds.includes(windowId)) continue

    return windowId
  }

  return null
}

function activeSurfaceIdForLayout(
  layout: WorkspaceLayout,
  activeWindowId: WindowId | undefined,
): SurfaceId | undefined {
  if (!activeWindowId) return undefined

  return layout.windowsById[activeWindowId]?.activeSurfaceId
}

function repairMruSurfaceIds(layout: WorkspaceLayout) {
  const visibleSurfaceIds = visibleSurfaceIdsInOrder(layout)
  const surfaceIds = uniqueSurfaceIds([...layout.mruSurfaceIds, ...visibleSurfaceIds])

  return surfaceIds.filter((surfaceId) => Boolean(layout.surfacesById[surfaceId]))
}

function repairMruWindowIds(layout: WorkspaceLayout) {
  const visibleWindowIds = visibleWindowIdsInOrder(layout)
  const windowIds = uniqueWindowIds([...layout.mruWindowIds, ...visibleWindowIds])

  return windowIds.filter((windowId) => Boolean(layout.windowsById[windowId]))
}

function repairRailState(layout: WorkspaceLayout): RailState {
  const visibleSurfaceIds = new Set(visibleSurfaceIdsInOrder(layout))
  const minimizedSurfaceIds = uniqueSurfaceIds(layout.rail.minimizedSurfaceIds).filter(
    (surfaceId) => Boolean(layout.surfacesById[surfaceId]) && !visibleSurfaceIds.has(surfaceId),
  )
  const runningSurfaceIds = runningSurfaceIdsForLayout(layout)

  return {
    minimizedSurfaceIds,
    pinnedSurfaceIds: uniqueSurfaceIds(layout.rail.pinnedSurfaceIds).filter((surfaceId) =>
      Boolean(layout.surfacesById[surfaceId]),
    ),
    recipeIds: uniqueRecipeIds(layout.rail.recipeIds).filter((recipeId) =>
      Boolean(layout.recipesById[recipeId]),
    ),
    runningSurfaceIds,
    visibleSingletonSurfaceIds: visibleSingletonSurfaceIdsForLayout(layout, visibleSurfaceIds),
  }
}

function runningSurfaceIdsForLayout(layout: WorkspaceLayout) {
  return uniqueSurfaceIds([
    ...layout.rail.runningSurfaceIds,
    ...Object.values(layout.surfacesById)
      .filter((surface) => surface.lifecycle === 'running')
      .map((surface) => surface.id),
  ]).filter((surfaceId) => Boolean(layout.surfacesById[surfaceId]))
}

function visibleSingletonSurfaceIdsForLayout(
  layout: WorkspaceLayout,
  visibleSurfaceIds: ReadonlySet<SurfaceId>,
) {
  return Object.values(layout.surfacesById)
    .filter((surface) => surface.cardinality === 'singleton')
    .filter((surface) => visibleSurfaceIds.has(surface.id))
    .map((surface) => surface.id)
}

function removeInvalidTransientSurfaces(
  surfacesById: WorkspaceLayout['surfacesById'],
): Record<string, Surface> {
  const validSurfacesById: Record<string, Surface> = {}

  for (const surface of Object.values(surfacesById)) {
    if (surface.lifecycle === 'transient' && hasInvalidTransientOwner(surface, surfacesById)) {
      continue
    }

    validSurfacesById[surface.id] = surface
  }

  return validSurfacesById
}

function hasInvalidTransientOwner(surface: Surface, surfacesById: WorkspaceLayout['surfacesById']) {
  if (surface.type === 'search-preview') return !hasValidTransientOwner(surface, surfacesById)
  if (!surface.ownerSurfaceId && !surface.ownerContextKey) return false

  return !hasValidTransientOwner(surface, surfacesById)
}

function hasValidTransientOwner(surface: Surface, surfacesById: WorkspaceLayout['surfacesById']) {
  if (!surface.ownerSurfaceId) return false
  if (!surface.ownerContextKey) return false

  return Boolean(surfacesById[surface.ownerSurfaceId])
}

function addRailSurface(
  rail: RailState,
  key: 'minimizedSurfaceIds' | 'runningSurfaceIds',
  surfaceId: SurfaceId,
) {
  if (rail[key].includes(surfaceId)) return rail

  return {
    ...rail,
    [key]: rail[key].concat(surfaceId),
  }
}

function uniqueSurfaceIds(surfaceIds: readonly SurfaceId[]) {
  return uniqueIds(surfaceIds) as SurfaceId[]
}

function uniqueWindowIds(windowIds: readonly WindowId[]) {
  return uniqueIds(windowIds) as WindowId[]
}

function uniqueRecipeIds(recipeIds: readonly RecipeId[]) {
  return uniqueIds(recipeIds) as RecipeId[]
}

function uniqueIds<TId extends string>(ids: readonly TId[]) {
  return Array.from(new Set(ids))
}

function omitNode(nodesById: Record<string, LayoutNode>, nodeId: LayoutNodeId) {
  const nextNodesById = { ...nodesById }
  delete nextNodesById[nodeId]

  return nextNodesById
}

function emptyTree(): TreeNormalizationResult {
  return {
    nodesById: {},
    rootNodeId: null,
    visibleWindowIds: [],
  }
}

function saneSize(size: number | undefined) {
  if (typeof size !== 'number') return MIN_SPLIT_SIZE
  if (!Number.isFinite(size)) return MIN_SPLIT_SIZE
  if (size <= 0) return MIN_SPLIT_SIZE

  return Math.max(size, MIN_SPLIT_SIZE)
}

function balancedSizes(count: number) {
  return Array.from({ length: count }, () => 1 / count)
}
