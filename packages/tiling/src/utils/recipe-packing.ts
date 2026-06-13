import { createTilingInvariantError } from '@workspace/tiling/utils/structured-errors'
import {
  balancedColumnCount,
  partitionIntoBalancedColumns,
  windowColumnSummary,
  windowIdsInReadingOrder,
  type WindowColumnSummary,
} from '@workspace/tiling/utils/balanced-columns'
import { balancedSizes } from '@workspace/tiling/utils/geometry-primitives'
import { layoutNodeId, workbenchWindowId } from '@workspace/tiling/utils/layout-ids'
import {
  nodeIsCollapsedWindow,
  recipeSlotForSurface,
  recipeSlotForWindow,
  stickyPlacementForSurface,
} from '@workspace/tiling/utils/layout-queries'
import {
  createPlaceholderSurface,
  createSplitNode,
  createWindowNode,
  createWorkbenchWindow,
} from '@workspace/tiling/utils/layout-builders'
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
export const DEFAULT_BOTTOM_PANE_SHARE = 0.26
const TOOL_PANE_COLUMN_SHARE = 0.24
const MIN_TOOL_PANE_SHARE = 0.15
// Default packing keeps the tool pane from dominating the editor.
const MAX_TOOL_PANE_SHARE = 0.55
// A pane the user explicitly dragged wider is honored up to the live-resize
// limit (the editor's minimum, 1 - MIN_EDITOR_RESIZE_SIZE = 0.78) instead of
// snapping back to the default cap on collapse/expand. Without this, a Files
// pane resized to e.g. 68% loses its width every collapse.
const MAX_USER_TOOL_PANE_SHARE = 0.78
// Above this right edge the tool pane previously had no main content beside
// it, so its old width says nothing about a usable left/main ratio.
const FULL_BLEED_TOOL_PANE_EDGE = 0.95
const EMPTY_MAIN_PLACEHOLDER_CONTEXT_KEY = 'empty-editor'
const EMPTY_MAIN_PLACEHOLDER_WINDOW_ID = workbenchWindowId('empty-editor')
const EMPTY_MAIN_PLACEHOLDER_NODE_ID = layoutNodeId('empty-editor')
const EMPTY_MAIN_PLACEHOLDER_BOOTSTRAP_NODE_ID = layoutNodeId('empty-editor-bootstrap')

type RecipeTree = {
  readonly nodeId: LayoutNodeId
  readonly nodesById: Record<string, LayoutNode>
}

type RecipeNodeAllocator = {
  readonly nodeId: (key: string) => LayoutNodeId
}

export type RecipeLayoutContext = {
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

export type RecipeNormalizeOptions = {
  // Windows whose current footprint says nothing about pane sizing — e.g. a
  // window expanding out of a collapsed strip still sits at the strip
  // position. Packing falls back to the recorded shares for them.
  readonly footprintIgnoredWindowIds?: ReadonlySet<WindowId>
}

export function normalizeToolPaneRecipeLayout(
  layout: WorkspaceLayout,
  options: RecipeNormalizeOptions = {},
): WorkspaceLayout {
  const layoutWithMainPlaceholder = layoutWithEmptyMainPlaceholder(layout)
  const context = recipeLayoutContext(layoutWithMainPlaceholder)
  // Arrival order and the previous pane footprint come from the pre-placeholder
  // tree: the placeholder bootstrap split halves every tool rect.
  const toolWindowIds = windowIdsInReadingOrder(
    layout,
    managedLeftToolWindowIds(layoutWithMainPlaceholder, context),
  )
  const bottomWindowId = visibleRecipeBottomWindowId(layoutWithMainPlaceholder, context)
  if (toolWindowIds.length === 0 && !bottomWindowId) return layout

  const bandWindowIds = collapsedBandWindowIds(layoutWithMainPlaceholder, context)
  const tree = recipePackedTree(
    layoutWithMainPlaceholder,
    toolWindowIds,
    bottomWindowId,
    recipeToolPaneSummary(layout, toolWindowIds, bandWindowIds, options),
    bandWindowIds,
    options,
  )
  if (!tree) return layout

  return normalizeWorkspaceLayout({
    ...layoutWithMainPlaceholder,
    nodesById: tree.nodesById,
    rootNodeId: tree.nodeId,
  })
}

// Snapshot the live pane shares before a collapse creates the first band.
// Band-state packs read these recorded shares instead of the degenerate
// footprints, so every pane returns at its pre-collapse size.
export function recordRecipePaneShares(layout: WorkspaceLayout): WorkspaceLayout {
  const context = recipeLayoutContext(layout)
  if (collapsedBandWindowIds(layout, context).length > 0) return layout

  const toolWindowIds = windowIdsInReadingOrder(layout, managedLeftToolWindowIds(layout, context))
  const bottomWindowId = visibleRecipeBottomWindowId(layout, context)
  const summary = windowColumnSummary(layout, toolWindowIds)
  const leftToolPane =
    summary && summary.rightEdge < FULL_BLEED_TOOL_PANE_EDGE
      ? {
          columnCount: Math.max(1, summary.columnCount),
          share: clampUserToolPaneShare(summary.rightEdge),
        }
      : layout.leftToolPane
  const bottomShare = currentBottomDockShare(layout, bottomWindowId)

  return {
    ...layout,
    bottomPaneShare: bottomShare ?? layout.bottomPaneShare,
    leftToolPane,
  }
}

// Pane sizes are user intent, recorded only when a resize drag touches a
// pane boundary split. Toggling a pane that was never resized re-opens it at
// the default share.
export function recordUserPaneShares(
  layout: WorkspaceLayout,
  splitId: LayoutNodeId,
): WorkspaceLayout {
  const split = layout.nodesById[splitId]
  if (split?.kind !== 'split') return layout

  return recordToolPaneResize(recordBottomPaneResize(layout, split), split)
}

function recordBottomPaneResize(layout: WorkspaceLayout, split: LayoutSplitNode): WorkspaceLayout {
  if (split.axis !== 'vertical') return layout

  const windowId = visibleRecipeBottomWindowId(layout)
  if (!windowId) return layout

  const nodeId = findNodeIdForWindow(layout, windowId)
  if (!nodeId) return layout

  const childIndex = split.childIds.indexOf(nodeId)
  if (childIndex < 0) return layout

  const share = repairSplitSizes(split.sizes, split.childIds.length)[childIndex]
  if (share === undefined || share === layout.bottomPaneShare) return layout

  return { ...layout, bottomPaneShare: share }
}

// The tool pane boundary is the horizontal split whose leading children hold
// only left-tool windows while the rest hold something else. Same-axis
// flattening can spread the pane's columns directly into that split, so the
// pane share is the sum of the leading all-tool children.
function recordToolPaneResize(layout: WorkspaceLayout, split: LayoutSplitNode): WorkspaceLayout {
  if (split.axis !== 'horizontal') return layout

  const columnCount = leadingToolChildCount(layout, split)
  if (columnCount === 0) return layout
  if (columnCount === split.childIds.length) return layout

  const sizes = repairSplitSizes(split.sizes, split.childIds.length)
  const share = sizes.slice(0, columnCount).reduce((sum, size) => sum + size, 0)
  if (share === layout.leftToolPane?.share) return layout

  return { ...layout, leftToolPane: { columnCount, share } }
}

function leadingToolChildCount(layout: WorkspaceLayout, split: LayoutSplitNode) {
  let count = 0

  for (const childId of split.childIds) {
    if (!subtreeHoldsOnlyToolWindows(layout, childId)) break

    count += 1
  }

  return count
}

function subtreeHoldsOnlyToolWindows(layout: WorkspaceLayout, nodeId: LayoutNodeId) {
  const windowIds = subtreeWindowIds(layout, nodeId)
  if (windowIds.length === 0) return false

  return windowIds.every((windowId) => recipeSlotForWindow(layout, windowId) === 'left-tool-pane')
}

function subtreeWindowIds(layout: WorkspaceLayout, nodeId: LayoutNodeId): readonly WindowId[] {
  const windowIds: WindowId[] = []
  const pending = [nodeId]
  const seen = new Set<LayoutNodeId>()

  while (pending.length > 0) {
    const currentId = pending.pop()
    if (!currentId || seen.has(currentId)) continue

    seen.add(currentId)
    const node = layout.nodesById[currentId]
    if (!node) continue
    if (node.kind === 'window') {
      windowIds.push(node.windowId)
      continue
    }

    pending.push(...node.childIds)
  }

  return windowIds
}

function layoutWithEmptyMainPlaceholder(layout: WorkspaceLayout): WorkspaceLayout {
  const context = recipeLayoutContext(layout)
  if (!needsEmptyMainPlaceholder(layout, context)) return layout

  const placeholder = createPlaceholderSurface({
    contextKey: EMPTY_MAIN_PLACEHOLDER_CONTEXT_KEY,
    title: 'No file selected',
  })
  const placeholderWindow = createWorkbenchWindow({
    activeSurfaceId: placeholder.id,
    id: EMPTY_MAIN_PLACEHOLDER_WINDOW_ID,
    surfaceIds: [placeholder.id],
  })
  const placeholderNode = createWindowNode({
    id: EMPTY_MAIN_PLACEHOLDER_NODE_ID,
    windowId: placeholderWindow.id,
  })
  const rootNodeId = layout.rootNodeId ?? placeholderNode.id
  const bootstrapNode = layout.rootNodeId
    ? createSplitNode({
        axis: 'horizontal',
        childIds: [layout.rootNodeId, placeholderNode.id],
        id: EMPTY_MAIN_PLACEHOLDER_BOOTSTRAP_NODE_ID,
        sizes: [0.5, 0.5],
      })
    : null

  return {
    ...layout,
    nodesById: {
      ...layout.nodesById,
      [placeholderNode.id]: placeholderNode,
      ...(bootstrapNode ? { [bootstrapNode.id]: bootstrapNode } : {}),
    },
    rootNodeId: bootstrapNode?.id ?? rootNodeId,
    surfacesById: {
      ...layout.surfacesById,
      [placeholder.id]: layout.surfacesById[placeholder.id] ?? placeholder,
    },
    windowsById: {
      ...layout.windowsById,
      [placeholderWindow.id]: layout.windowsById[placeholderWindow.id] ?? placeholderWindow,
    },
  }
}

function needsEmptyMainPlaceholder(layout: WorkspaceLayout, context: RecipeLayoutContext) {
  const bottomWindowId = visibleRecipeBottomWindowId(layout, context)
  if (managedLeftToolWindowIds(layout, context).length === 0) return false
  if (!bottomWindowId) return false
  if (!bottomWindowIsTerminalFirst(layout, bottomWindowId)) return false

  return visibleWindowIdsForRecipeSlotsWithContext(layout, ['editor-center'], context).length === 0
}

function bottomWindowIsTerminalFirst(layout: WorkspaceLayout, windowId: WindowId) {
  const window = layout.windowsById[windowId]
  if (!window) return false
  if (window.surfaceIds.length !== 1) return false

  return layout.surfacesById[window.surfaceIds[0]]?.type === 'terminal'
}

export function isToolPaneRecipeSlot(slot: WorkspaceRecipeSlot) {
  return slot === 'left-tool-pane'
}

export function isRecipePackedSlot(slot: WorkspaceRecipeSlot) {
  if (isToolPaneRecipeSlot(slot)) return true

  return slot === 'bottom'
}

export function visibleWindowIdForRecipeSlot(layout: WorkspaceLayout, slot: WorkspaceRecipeSlot) {
  if (slot === 'bottom') return visibleRecipeBottomWindowId(layout)

  return visibleWindowIdForRecipeSlotWithContext(layout, slot)
}

export function visibleWindowIdsForRecipeSlots(
  layout: WorkspaceLayout,
  slots: readonly WorkspaceRecipeSlot[],
) {
  return visibleWindowIdsForRecipeSlotsWithContext(layout, slots)
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
  // Collapsed windows live at the root edge the user collapsed them to; the
  // packer leaves them there and re-manages the window on expand.
  if (layout.windowsById[windowId]?.mode === 'collapsed') return
  if (windowHasEarlierManualPlacementDependent(layout, windowId, type, context)) return

  seen.add(windowId)
  windowIds.push(windowId)
}

export function surfaceHasValidStickyPlacement(
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

function windowHasEarlierManualPlacementDependent(
  layout: WorkspaceLayout,
  windowId: WindowId,
  targetType: SurfaceType,
  context: RecipeLayoutContext,
) {
  const targetIndex = recipeLeftToolSurfaceTypeIndex(targetType)
  if (targetIndex < 0) return false

  for (const surface of Object.values(layout.surfacesById)) {
    if (!surfaceHasValidStickyPlacement(layout, surface.id, context)) continue
    if (!stickyPlacementTargetsWindow(layout, surface.id, windowId)) continue
    if (recipeLeftToolSurfaceTypeIndex(surface.type) >= targetIndex) continue

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

  return stickyPlacementTargetWindowId(layout, surfaceId) === windowId
}

function stickyPlacementTargetWindowId(layout: WorkspaceLayout, surfaceId: SurfaceId) {
  const placement = stickyPlacementForSurface(layout, surfaceId)
  if (placement?.kind === 'window-center') return placement.windowId
  if (placement?.kind === 'window-edge') return placement.windowId

  return null
}

function recipeLeftToolSurfaceTypeIndex(type: SurfaceType) {
  return RECIPE_LEFT_TOOL_SURFACE_TYPES.indexOf(
    type as (typeof RECIPE_LEFT_TOOL_SURFACE_TYPES)[number],
  )
}

// While collapsed bands exist, the live footprints are degenerate (panes
// balloon into the space the strips vacated), so packing falls back to the
// shares recorded before the first collapse. A window that just expanded
// out of a strip still occupies the strip's split slot, which skews every
// rect in the tree — so its presence makes the whole footprint unreliable.
function recipeToolPaneSummary(
  layout: WorkspaceLayout,
  toolWindowIds: readonly WindowId[],
  bandWindowIds: readonly WindowId[],
  options: RecipeNormalizeOptions,
) {
  if (bandWindowIds.length > 0) return null
  if (footprintsUnreliable(options)) return null

  return windowColumnSummary(layout, toolWindowIds)
}

function footprintsUnreliable(options: RecipeNormalizeOptions) {
  return Boolean(options.footprintIgnoredWindowIds && options.footprintIgnoredWindowIds.size > 0)
}

function recipePackedTree(
  layout: WorkspaceLayout,
  toolWindowIds: readonly WindowId[],
  bottomWindowId: WindowId | null,
  toolPaneSummary: WindowColumnSummary | null,
  bandWindowIds: readonly WindowId[],
  options: RecipeNormalizeOptions,
) {
  const bottomWindowIds = bottomWindowId ? [bottomWindowId] : []
  const excludedWindowIds = new Set([...toolWindowIds, ...bottomWindowIds, ...bandWindowIds])
  const compactMainTree = compactTreeWithoutWindows(layout, excludedWindowIds)
  const allocator = createRecipeNodeAllocator(recipeTreeNodeIds(compactMainTree))
  const leftTree = balancedWindowTree(allocator, toolWindowIds, 'recipe:left-tool-pane')
  const mainTree = mainContentTree(layout, excludedWindowIds, allocator, compactMainTree)
  const bottomTree = bottomWindowId
    ? windowTree(bottomWindowId, allocator.nodeId('recipe:bottom'))
    : null
  const mainPanelTree = recipeMainPanelTree(
    layout,
    mainTree,
    bottomTree,
    allocator,
    bottomWindowId,
    options,
  )
  const contentTree = recipeContentTree(
    layout,
    leftTree,
    mainPanelTree,
    allocator,
    toolWindowIds,
    toolPaneSummary,
  )

  return wrapCollapsedBands(layout, contentTree, bandWindowIds, allocator)
}

// Collapsed windows render as strips at their collapse edge. Rebuilding the
// recipe tree around them would drag the strip back into the main panel (a
// right rail would end up stacked above the bottom dock), so the packer
// keeps them out of the rebuild and wraps them around the packed content.
function collapsedBandWindowIds(layout: WorkspaceLayout, context: RecipeLayoutContext) {
  const bandWindowIds = context.visibleWindowIds.filter((windowId) => {
    const window = layout.windowsById[windowId]
    if (window?.mode !== 'collapsed') return false

    return Boolean(window.collapsedEdge)
  })

  return windowIdsInReadingOrder(layout, bandWindowIds)
}

function wrapCollapsedBands(
  layout: WorkspaceLayout,
  contentTree: RecipeTree | null,
  bandWindowIds: readonly WindowId[],
  allocator: RecipeNodeAllocator,
) {
  let wrapped = contentTree

  for (const windowId of bandWindowIds) {
    const band = windowTree(windowId, allocator.nodeId(`recipe:band:${windowId}`))
    if (!wrapped) {
      wrapped = band
      continue
    }

    const edge = layout.windowsById[windowId]?.collapsedEdge
    if (!edge) continue

    const leading = edge === 'left' || edge === 'top'
    wrapped = splitTree({
      axis: edge === 'left' || edge === 'right' ? 'horizontal' : 'vertical',
      id: allocator.nodeId(`recipe:band-split:${windowId}`),
      sizes: balancedSizes(2),
      trees: leading ? [band, wrapped] : [wrapped, band],
    })
  }

  return wrapped
}

function createRecipeNodeAllocator(usedNodeIdsInput: readonly LayoutNodeId[]): RecipeNodeAllocator {
  const usedNodeIds = new Set(usedNodeIdsInput)

  return {
    nodeId: (key) => {
      const nodeId = uniqueRecipeNodeId((candidate) => !usedNodeIds.has(candidate), key)
      usedNodeIds.add(nodeId)

      return nodeId
    },
  }
}

// The bottom dock is content-derived, mirroring the tool pane: the first
// visible window holding a bottom-slot surface the user has not manually
// placed. Manually dragged-out terminals carry a sticky placement, so their
// windows stay unmanaged and keep their spot.
function visibleRecipeBottomWindowId(
  layout: WorkspaceLayout,
  context?: RecipeLayoutContext,
): WindowId | null {
  const visibleWindowIds = context?.visibleWindowIds ?? visibleWindowIdsInOrder(layout)

  for (const windowId of visibleWindowIds) {
    if (windowHoldsManagedBottomSurface(layout, windowId, context)) return windowId
  }

  return null
}

function windowHoldsManagedBottomSurface(
  layout: WorkspaceLayout,
  windowId: WindowId,
  context?: RecipeLayoutContext,
) {
  const window = layout.windowsById[windowId]
  if (!window) return false
  // Collapsed docks stay at their collapse edge until expanded.
  if (window.mode === 'collapsed') return false

  for (const surfaceId of window.surfaceIds) {
    const surface = layout.surfacesById[surfaceId]
    if (!surface) continue
    if (recipeSlotForSurface(layout, surface) !== 'bottom') continue
    if (surfaceHasValidStickyPlacement(layout, surfaceId, context)) continue

    return true
  }

  return false
}

// Packs windows into balanced columns: a horizontal split of columns where
// each column stacks its windows vertically, per the order-based packing rule.
function balancedWindowTree(
  allocator: RecipeNodeAllocator,
  windowIds: readonly WindowId[],
  nodeKey: string,
) {
  const columns = partitionIntoBalancedColumns(windowIds)
  const columnTrees = columns.map((columnWindowIds, columnIndex) =>
    columnWindowTree(allocator, columnWindowIds, nodeKey, columnIndex),
  )
  if (columnTrees.length === 0) return null
  if (columnTrees.length === 1) return columnTrees[0]

  return splitTree({
    axis: 'horizontal',
    id: allocator.nodeId(nodeKey),
    sizes: balancedSizes(columnTrees.length),
    trees: columnTrees,
  })
}

function columnWindowTree(
  allocator: RecipeNodeAllocator,
  columnWindowIds: readonly WindowId[],
  nodeKey: string,
  columnIndex: number,
) {
  const windowTrees = columnWindowIds.map((windowId) =>
    windowTree(windowId, allocator.nodeId(`${nodeKey}:window:${windowId}`)),
  )
  if (windowTrees.length === 1) return windowTrees[0]

  return splitTree({
    axis: 'vertical',
    id: allocator.nodeId(`${nodeKey}:col:${columnIndex}`),
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

function recipeTreeNodeIds(tree: RecipeTree | null): readonly LayoutNodeId[] {
  if (!tree) return []

  return Object.keys(tree.nodesById) as LayoutNodeId[]
}

function mainContentTree(
  layout: WorkspaceLayout,
  excludedWindowIds: ReadonlySet<WindowId>,
  allocator: RecipeNodeAllocator,
  compactTree: RecipeTree | null,
) {
  const compactWindowIds = compactTree
    ? windowIdsInRecipeTree(layout, compactTree)
    : new Set<WindowId>()
  const missingWindowIds = unmanagedWindowIds(layout, excludedWindowIds, compactWindowIds)
  if (missingWindowIds.length === 0) return compactTree

  const missingTree = balancedWindowTree(allocator, missingWindowIds, 'recipe:main:missing')
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
  toolPaneSummary: WindowColumnSummary | null,
) {
  if (!leftTree) return mainTree
  if (!mainTree) return leftTree

  return splitTree({
    axis: 'horizontal',
    id: allocator.nodeId('recipe:content'),
    sizes: recipeContentSplitSizes(layout, toolWindowIds.length, toolPaneSummary),
    trees: [leftTree, mainTree],
  })
}

function recipeContentSplitSizes(
  layout: WorkspaceLayout,
  toolWindowCount: number,
  toolPaneSummary: WindowColumnSummary | null,
) {
  const columnCount = Math.max(1, balancedColumnCount(toolWindowCount))
  const share = toolPaneShare(layout, columnCount, toolPaneSummary)

  return [share, 1 - share]
}

function toolPaneShare(
  layout: WorkspaceLayout,
  columnCount: number,
  summary: WindowColumnSummary | null,
) {
  if (!summary) return toolPaneRestoreShare(layout, columnCount)
  if (summary.rightEdge >= FULL_BLEED_TOOL_PANE_EDGE) {
    return toolPaneRestoreShare(layout, columnCount)
  }

  // Scale the previous pane share by the column count change so columns keep
  // their width instead of resetting user-resized ratios. This footprint is a
  // real (possibly user-dragged) width, so honor the wider user cap.
  return clampUserToolPaneShare(
    summary.rightEdge * (columnCount / Math.max(1, summary.columnCount)),
  )
}

// The width a freshly shown tool pane should take: the user-resized share
// scaled to the column count, or the default column share if never resized.
export function toolPaneRestoreShare(layout: WorkspaceLayout, columnCount: number) {
  const stored = layout.leftToolPane
  if (!stored) return clampToolPaneShare(TOOL_PANE_COLUMN_SHARE * columnCount)

  return clampUserToolPaneShare(stored.share * (columnCount / Math.max(1, stored.columnCount)))
}

function clampToolPaneShare(share: number) {
  return Math.min(MAX_TOOL_PANE_SHARE, Math.max(MIN_TOOL_PANE_SHARE, share))
}

function clampUserToolPaneShare(share: number) {
  return Math.min(MAX_USER_TOOL_PANE_SHARE, Math.max(MIN_TOOL_PANE_SHARE, share))
}

function recipeMainPanelTree(
  layout: WorkspaceLayout,
  mainTree: RecipeTree | null,
  bottomTree: RecipeTree | null,
  allocator: RecipeNodeAllocator,
  bottomWindowId: WindowId | null,
  options: RecipeNormalizeOptions,
) {
  if (!mainTree) return bottomTree
  if (!bottomTree) return mainTree

  return splitTree({
    axis: 'vertical',
    id: allocator.nodeId('recipe:main-panel'),
    sizes: recipeMainPanelSplitSizes(layout, bottomWindowId, options),
    trees: [mainTree, bottomTree],
  })
}

function recipeMainPanelSplitSizes(
  layout: WorkspaceLayout,
  bottomWindowId: WindowId | null,
  options: RecipeNormalizeOptions,
) {
  const footprintShare = footprintsUnreliable(options)
    ? null
    : currentBottomDockShare(layout, bottomWindowId)
  const share = footprintShare ?? layout.bottomPaneShare ?? DEFAULT_BOTTOM_PANE_SHARE

  return [1 - share, share]
}

// The dock's current footprint is its size at its own index in the enclosing
// vertical split. Same-axis flattening can spread siblings into that split,
// so never assume it is a two-child [main, bottom] pair. Collapsed strips in
// the split hold fixed pixels, not ratio, so the share renormalizes over the
// real panes — otherwise a flattened band ratio shrinks the dock every pack.
function currentBottomDockShare(layout: WorkspaceLayout, bottomWindowId: WindowId | null) {
  const bottomNodeId = bottomWindowId ? findNodeIdForWindow(layout, bottomWindowId) : null
  const parentNodeId = bottomNodeId ? findParentNodeId(layout, bottomNodeId) : null
  const parentNode = parentNodeId ? layout.nodesById[parentNodeId] : null
  if (!bottomNodeId || parentNode?.kind !== 'split' || parentNode.axis !== 'vertical') return null

  const sizes = repairSplitSizes(parentNode.sizes, parentNode.childIds.length)
  const dockSize = sizes[parentNode.childIds.indexOf(bottomNodeId)]
  if (dockSize === undefined) return null

  const flexibleTotal = parentNode.childIds.reduce((sum, childId, index) => {
    if (nodeIsCollapsedWindow(layout, childId)) return sum

    return sum + (sizes[index] ?? 0)
  }, 0)
  if (flexibleTotal <= 0) return null

  return dockSize / flexibleTotal
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
