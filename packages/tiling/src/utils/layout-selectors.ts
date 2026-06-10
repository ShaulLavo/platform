import {
  edgeAxis,
  findNodeIdForWindow,
  findParentNodeId,
  findWindowIdContainingSurface,
  isLeadingEdge,
  visibleSurfaceIdsInOrder,
  visibleWindowIdsInOrder,
} from '@workspace/tiling/utils/layout-normalize'
import {
  commandSearchText,
  mergeWindowManagementCommands,
} from '@workspace/tiling/utils/layout-command-catalog'
import type {
  LayoutEdge,
  LayoutCommandId,
  LayoutOperation,
  LayoutNode,
  LayoutNodeId,
  Surface,
  SurfaceId,
  WindowId,
  WindowManagementCommand,
  WindowManagementCommandId,
  WorkbenchWindow,
  WorkspaceLayout,
  WorkspaceLayoutCommand,
} from '@workspace/tiling/utils/layout-types'

type LayoutOperationType = LayoutOperation['type']

export type MaterializedSplitNode = {
  readonly axis: Extract<LayoutNode, { readonly kind: 'split' }>['axis']
  readonly children: readonly MaterializedLayoutNode[]
  readonly id: LayoutNodeId
  readonly kind: 'split'
  readonly path: readonly LayoutNodeId[]
  readonly sizes: readonly number[]
}

export type MaterializedWindowNode = {
  readonly activeSurface: Surface | null
  readonly id: LayoutNodeId
  readonly kind: 'window'
  readonly path: readonly LayoutNodeId[]
  readonly surfaces: readonly Surface[]
  readonly window: WorkbenchWindow
  readonly windowId: WindowId
}

export type MaterializedLayoutNode = MaterializedSplitNode | MaterializedWindowNode

export type WindowPathResolution = {
  readonly nodeId: LayoutNodeId
  readonly nodePath: readonly LayoutNodeId[]
  readonly window: WorkbenchWindow
  readonly windowId: WindowId
}

export type SurfacePathResolution = WindowPathResolution & {
  readonly surface: Surface
  readonly surfaceId: SurfaceId
  readonly surfaceIndex: number
}

export type LayoutMruFallback = {
  readonly surface: Surface | null
  readonly window: WorkbenchWindow | null
}

export type WindowNeighborIds = Partial<Record<LayoutEdge, WindowId>>

export type CapabilityFilteredCommandTargets = {
  readonly activeSurface: Surface | null
  readonly activeWindow: WorkbenchWindow | null
  readonly closableSurfaceIds: readonly SurfaceId[]
  readonly minimizableSurfaceIds: readonly SurfaceId[]
  readonly movableWindowIds: readonly WindowId[]
  readonly splittableSurfaceIds: readonly SurfaceId[]
}

export type LayoutCommandPaletteRow =
  | {
      readonly aliases: readonly string[]
      readonly category: 'Window Management'
      readonly command: WindowManagementCommand
      readonly disabledReason: string | null
      readonly enabled: boolean
      readonly icon: string
      readonly id: WindowManagementCommandId
      readonly kind: 'built-in-window' | 'custom-window'
      readonly searchableText: string
      readonly title: string
    }
  | {
      readonly aliases: readonly string[]
      readonly category: 'Saved Layouts'
      readonly command: WorkspaceLayoutCommand
      readonly disabledReason: string | null
      readonly enabled: boolean
      readonly icon: string
      readonly id: LayoutCommandId
      readonly kind: 'saved-layout'
      readonly searchableText: string
      readonly title: string
    }

export function selectMaterializedLayoutTree(
  layout: WorkspaceLayout,
): MaterializedLayoutNode | null {
  if (!layout.rootNodeId) return null

  return materializeNode(layout, layout.rootNodeId, [])
}

export function resolveNodePath(
  layout: WorkspaceLayout,
  targetNodeId: LayoutNodeId,
): readonly LayoutNodeId[] | null {
  if (!layout.rootNodeId) return null

  return findNodePath(layout, layout.rootNodeId, targetNodeId, [])
}

export function resolveWindowPath(
  layout: WorkspaceLayout,
  windowId: WindowId,
): WindowPathResolution | null {
  const nodeId = findNodeIdForWindow(layout, windowId)
  const window = layout.windowsById[windowId]
  if (!nodeId || !window) return null

  const nodePath = resolveNodePath(layout, nodeId)
  if (!nodePath) return null

  return { nodeId, nodePath, window, windowId }
}

export function resolveSurfacePath(
  layout: WorkspaceLayout,
  surfaceId: SurfaceId,
): SurfacePathResolution | null {
  const windowId = findWindowIdContainingSurface(layout, surfaceId)
  const surface = layout.surfacesById[surfaceId]
  if (!windowId || !surface) return null

  const windowPath = resolveWindowPath(layout, windowId)
  if (!windowPath) return null

  return {
    ...windowPath,
    surface,
    surfaceId,
    surfaceIndex: windowPath.window.surfaceIds.indexOf(surfaceId),
  }
}

export function selectActiveWindow(layout: WorkspaceLayout): WorkbenchWindow | null {
  const activeWindowId = layout.activeWindowId
  if (!activeWindowId) return null

  return layout.windowsById[activeWindowId] ?? null
}

export function selectActiveSurface(layout: WorkspaceLayout): Surface | null {
  const activeSurfaceId = layout.activeSurfaceId
  if (!activeSurfaceId) return null

  return layout.surfacesById[activeSurfaceId] ?? null
}

export function selectVisibleSurfaces(layout: WorkspaceLayout): readonly Surface[] {
  return visibleSurfaceIdsInOrder(layout)
    .map((surfaceId) => layout.surfacesById[surfaceId])
    .filter(isSurface)
}

export function selectMruFallback(layout: WorkspaceLayout): LayoutMruFallback {
  return {
    surface: selectMruSurfaceFallback(layout),
    window: selectMruWindowFallback(layout),
  }
}

export function selectWindowNeighborIds(
  layout: WorkspaceLayout,
  windowId: WindowId,
): WindowNeighborIds {
  const nodeId = findNodeIdForWindow(layout, windowId)
  if (!nodeId) return {}

  return {
    bottom: selectWindowNeighborId(layout, nodeId, 'bottom'),
    left: selectWindowNeighborId(layout, nodeId, 'left'),
    right: selectWindowNeighborId(layout, nodeId, 'right'),
    top: selectWindowNeighborId(layout, nodeId, 'top'),
  }
}

export function selectCapabilityFilteredCommandTargets(
  layout: WorkspaceLayout,
): CapabilityFilteredCommandTargets {
  const visibleSurfaces = selectVisibleSurfaces(layout)

  return {
    activeSurface: selectActiveSurface(layout),
    activeWindow: selectActiveWindow(layout),
    closableSurfaceIds: visibleSurfaces.filter(canCloseSurface).map((surface) => surface.id),
    minimizableSurfaceIds: visibleSurfaces
      .filter((surface) => surface.capabilities.canCollapse)
      .map((surface) => surface.id),
    movableWindowIds: visibleWindowIdsInOrder(layout),
    splittableSurfaceIds: visibleSurfaces
      .filter((surface) => surface.capabilities.canSplit)
      .map((surface) => surface.id),
  }
}

export function selectCommandPaletteRows(
  layout: WorkspaceLayout,
): readonly LayoutCommandPaletteRow[] {
  return [
    ...selectWindowCommandPaletteRows(layout),
    ...selectSavedLayoutCommandPaletteRows(layout),
  ].sort(compareCommandRows)
}

export function windowCommandDisabledReason(
  layout: WorkspaceLayout,
  command: WindowManagementCommand,
): string | null {
  if (command.kind === 'custom-window' && !command.enabled) return 'Command is disabled.'
  if (command.kind === 'custom-window') return customWindowCommandDisabledReason(layout)
  if (command.capabilityPredicate) {
    return capabilityPredicateDisabledReason(layout, command.capabilityPredicate)
  }
  if (operationRequiresActiveWindow(command.operation) && !selectActiveWindow(layout)) {
    return 'No active window.'
  }
  if (operationRequiresActiveSurface(command.operation) && !selectActiveSurface(layout)) {
    return 'No active surface.'
  }

  return activeCapabilityDisabledReason(layout, command.operation)
}

function selectWindowCommandPaletteRows(
  layout: WorkspaceLayout,
): readonly Extract<LayoutCommandPaletteRow, { readonly category: 'Window Management' }>[] {
  const commands = mergeWindowManagementCommands(Object.values(layout.windowCommandsById))

  return commands.map((command) => ({
    aliases: command.aliases,
    category: 'Window Management',
    command,
    disabledReason: windowCommandDisabledReason(layout, command),
    enabled: command.kind === 'built-in' || command.enabled,
    icon: command.icon,
    id: command.id,
    kind: command.kind === 'built-in' ? 'built-in-window' : 'custom-window',
    searchableText: commandSearchText(command),
    title: command.title,
  }))
}

function selectSavedLayoutCommandPaletteRows(
  layout: WorkspaceLayout,
): readonly Extract<LayoutCommandPaletteRow, { readonly category: 'Saved Layouts' }>[] {
  return Object.values(layout.layoutCommandsById).map((command) => ({
    aliases: command.aliases,
    category: 'Saved Layouts',
    command,
    disabledReason: layoutCommandDisabledReason(command),
    enabled: command.enabled,
    icon: command.icon,
    id: command.id,
    kind: 'saved-layout',
    searchableText: savedLayoutCommandSearchText(command),
    title: command.title,
  }))
}

function materializeNode(
  layout: WorkspaceLayout,
  nodeId: LayoutNodeId,
  path: readonly LayoutNodeId[],
): MaterializedLayoutNode | null {
  const node = layout.nodesById[nodeId]
  if (!node) return null

  const nodePath = path.concat(nodeId)
  if (node.kind === 'window') return materializeWindowNode(layout, node, nodePath)

  return {
    axis: node.axis,
    children: materializeChildNodes(layout, node.childIds, nodePath),
    id: node.id,
    kind: 'split',
    path: nodePath,
    sizes: node.sizes,
  }
}

function materializeWindowNode(
  layout: WorkspaceLayout,
  node: Extract<LayoutNode, { readonly kind: 'window' }>,
  path: readonly LayoutNodeId[],
): MaterializedWindowNode | null {
  const window = layout.windowsById[node.windowId]
  if (!window) return null

  return {
    activeSurface: layout.surfacesById[window.activeSurfaceId] ?? null,
    id: node.id,
    kind: 'window',
    path,
    surfaces: window.surfaceIds
      .map((surfaceId) => layout.surfacesById[surfaceId])
      .filter(isSurface),
    window,
    windowId: window.id,
  }
}

function materializeChildNodes(
  layout: WorkspaceLayout,
  childIds: readonly LayoutNodeId[],
  path: readonly LayoutNodeId[],
) {
  const children: MaterializedLayoutNode[] = []

  for (const childId of childIds) {
    const child = materializeNode(layout, childId, path)
    if (!child) continue

    children.push(child)
  }

  return children
}

function findNodePath(
  layout: WorkspaceLayout,
  nodeId: LayoutNodeId,
  targetNodeId: LayoutNodeId,
  path: readonly LayoutNodeId[],
): readonly LayoutNodeId[] | null {
  const node = layout.nodesById[nodeId]
  if (!node) return null

  const nodePath = path.concat(nodeId)
  if (nodeId === targetNodeId) return nodePath
  if (node.kind === 'window') return null

  for (const childId of node.childIds) {
    const childPath = findNodePath(layout, childId, targetNodeId, nodePath)
    if (childPath) return childPath
  }

  return null
}

function selectMruSurfaceFallback(layout: WorkspaceLayout): Surface | null {
  const backgroundSurfaceIds = new Set(layout.rail.backgroundSurfaceIds)

  for (const surfaceId of layout.mruSurfaceIds) {
    const surface = layout.surfacesById[surfaceId]
    if (!surface || backgroundSurfaceIds.has(surfaceId)) continue

    return surface
  }

  return selectActiveSurface(layout)
}

function selectMruWindowFallback(layout: WorkspaceLayout): WorkbenchWindow | null {
  for (const windowId of layout.mruWindowIds) {
    const window = layout.windowsById[windowId]
    if (window) return window
  }

  return selectActiveWindow(layout)
}

function selectWindowNeighborId(
  layout: WorkspaceLayout,
  nodeId: LayoutNodeId,
  edge: LayoutEdge,
): WindowId | undefined {
  const parentNodeId = findParentNodeId(layout, nodeId)
  if (!parentNodeId) return undefined

  const parent = layout.nodesById[parentNodeId]
  if (!parent || parent.kind !== 'split') return undefined

  const neighborId = siblingNeighborId(layout, parent, nodeId, edge)
  if (neighborId) return neighborId

  return selectWindowNeighborId(layout, parentNodeId, edge)
}

function siblingNeighborId(
  layout: WorkspaceLayout,
  parent: Extract<LayoutNode, { readonly kind: 'split' }>,
  nodeId: LayoutNodeId,
  edge: LayoutEdge,
): WindowId | undefined {
  if (parent.axis !== edgeAxis(edge)) return undefined

  const index = parent.childIds.indexOf(nodeId)
  const siblingIndex = isLeadingEdge(edge) ? index - 1 : index + 1
  const siblingNodeId = parent.childIds[siblingIndex]
  if (!siblingNodeId) return undefined

  return nearestWindowIdForEdge(layout, siblingNodeId, oppositeEdge(edge)) ?? undefined
}

function nearestWindowIdForEdge(
  layout: WorkspaceLayout,
  nodeId: LayoutNodeId,
  edge: LayoutEdge,
): WindowId | null {
  const node = layout.nodesById[nodeId]
  if (!node) return null
  if (node.kind === 'window') return node.windowId

  const childId = nearestChildIdForEdge(node, edge)
  if (!childId) return null

  return nearestWindowIdForEdge(layout, childId, edge)
}

function nearestChildIdForEdge(
  node: Extract<LayoutNode, { readonly kind: 'split' }>,
  edge: LayoutEdge,
) {
  if (node.axis !== edgeAxis(edge)) return node.childIds[0]

  return isLeadingEdge(edge) ? node.childIds[0] : node.childIds[node.childIds.length - 1]
}

function activeCapabilityDisabledReason(layout: WorkspaceLayout, operation: LayoutOperationType) {
  const activeSurface = selectActiveSurface(layout)
  if (operation === 'closeSurface' && activeSurface && !canCloseSurface(activeSurface)) {
    return 'Active surface cannot be closed.'
  }
  if (operation === 'splitWindow' && activeSurface && !activeSurface.capabilities.canSplit) {
    return 'Active surface cannot be split.'
  }

  return null
}

function capabilityPredicateDisabledReason(layout: WorkspaceLayout, predicate: string) {
  if (predicate === 'active-window') return activeWindowDisabledReason(layout)
  if (predicate === 'active-window-can-collapse')
    return activeWindowCanCollapseDisabledReason(layout)
  if (predicate === 'active-window-can-expand') return activeWindowCanExpandDisabledReason(layout)
  if (predicate === 'active-surface-can-close') return activeSurfaceCanCloseDisabledReason(layout)
  if (predicate === 'active-surface-can-background') {
    return activeSurfaceCanBackgroundDisabledReason(layout)
  }
  if (predicate === 'active-window-and-splittable-surface') {
    return activeWindowAndSplittableSurfaceDisabledReason(layout)
  }
  if (predicate === 'active-surface-can-move') return activeSurfaceCanMoveDisabledReason(layout)
  if (predicate === 'display-movement-unavailable') {
    return 'Display movement is unavailable in the browser workbench.'
  }
  if (predicate === 'rail-available') return railAvailableDisabledReason(layout)

  return null
}

function activeWindowDisabledReason(layout: WorkspaceLayout) {
  if (selectActiveWindow(layout)) return null

  return 'No active window.'
}

function activeWindowCanCollapseDisabledReason(layout: WorkspaceLayout) {
  const window = selectActiveWindow(layout)
  if (!window) return 'No active window.'
  if (window.mode === 'collapsed') return 'Active window is already collapsed.'
  if (windowCanCollapse(layout, window)) return null

  return 'Active window cannot be collapsed.'
}

function activeWindowCanExpandDisabledReason(layout: WorkspaceLayout) {
  const window = selectActiveWindow(layout)
  if (!window) return 'No active window.'
  if (window.mode === 'collapsed') return null

  return 'Active window is not collapsed.'
}

function activeSurfaceCanCloseDisabledReason(layout: WorkspaceLayout) {
  const activeSurface = selectActiveSurface(layout)
  if (!activeSurface) return 'No active surface.'
  if (canCloseSurface(activeSurface)) return null

  return 'Active surface cannot be closed.'
}

function activeSurfaceCanBackgroundDisabledReason(layout: WorkspaceLayout) {
  const activeSurface = selectActiveSurface(layout)
  if (!activeSurface) return 'No active surface.'
  if (activeSurface.capabilities.canCollapse) return null

  return 'Active surface cannot be backgrounded.'
}

function activeSurfaceCanMoveDisabledReason(layout: WorkspaceLayout) {
  const activeSurface = selectActiveSurface(layout)
  if (!activeSurface) return 'No active surface.'
  if (activeSurface.capabilities.validPlacements.length > 0) return null

  return 'Active surface cannot be moved.'
}

function railAvailableDisabledReason(layout: WorkspaceLayout) {
  if (layout.rail.backgroundSurfaceIds.length > 0) return null
  if (layout.rail.pinnedSurfaceIds.length > 0) return null
  if (layout.rail.runningSurfaceIds.length > 0) return null
  if (layout.rail.visibleSingletonSurfaceIds.length > 0) return null

  return 'No rail items are available.'
}

function activeWindowAndSplittableSurfaceDisabledReason(layout: WorkspaceLayout) {
  const activeWindowReason = activeWindowDisabledReason(layout)
  if (activeWindowReason) return activeWindowReason

  const activeSurface = selectActiveSurface(layout)
  if (!activeSurface) return 'No active surface.'
  if (activeSurface.capabilities.canSplit) return null

  return 'Active surface cannot be split.'
}

function operationRequiresActiveSurface(operation: LayoutOperationType) {
  return ['closeSurface', 'moveSurface', 'restoreSurface', 'tabSurface'].includes(operation)
}

function operationRequiresActiveWindow(operation: LayoutOperationType) {
  return [
    'applyCustomWindowCommand',
    'fullscreenWindow',
    'maximizeWindow',
    'moveWindow',
    'reorderSurface',
    'resizeSplit',
    'restoreWindow',
    'splitWindow',
  ].includes(operation)
}

function customWindowCommandDisabledReason(layout: WorkspaceLayout) {
  if (!selectActiveWindow(layout)) return 'No active window.'

  return null
}

function layoutCommandDisabledReason(command: WorkspaceLayoutCommand) {
  if (!command.enabled) return 'Command is disabled.'
  if (command.slots.length === 0) return 'Layout command has no surfaces.'

  return null
}

function savedLayoutCommandSearchText(command: WorkspaceLayoutCommand) {
  return [command.title, command.id, ...command.aliases].join(' ').toLowerCase()
}

function compareCommandRows(left: LayoutCommandPaletteRow, right: LayoutCommandPaletteRow) {
  return left.title.localeCompare(right.title)
}

function canCloseSurface(surface: Surface) {
  if (!surface.capabilities.canClose) return false

  return surface.closePolicy.type !== 'block'
}

function windowCanCollapse(layout: WorkspaceLayout, window: WorkbenchWindow) {
  for (const surfaceId of window.surfaceIds) {
    const surface = layout.surfacesById[surfaceId]
    if (!surface?.capabilities.canCollapse) return false
  }

  return true
}

function isSurface(surface: Surface | undefined): surface is Surface {
  return Boolean(surface)
}

function oppositeEdge(edge: LayoutEdge): LayoutEdge {
  if (edge === 'left') return 'right'
  if (edge === 'right') return 'left'
  if (edge === 'top') return 'bottom'

  return 'top'
}
