import {
  activeEditorPaneTab,
  activeTabForPane,
  normalizeEditorPaneLayout,
  type EditorPaneLeaf,
  type EditorPaneLayout,
  type EditorPaneNode,
  type EditorPaneSplit,
  type EditorPaneTab,
} from '@/features/editor/state/editor-pane-state'
import { parseDiffDocumentId } from '@/features/git/diff-document'

import {
  CLASSIC_DIAGNOSTICS_NODE_ID,
  CLASSIC_DIAGNOSTICS_WINDOW_ID,
  CLASSIC_FILE_NAVIGATOR_NODE_ID,
  CLASSIC_FILE_NAVIGATOR_WINDOW_ID,
  CLASSIC_MAIN_NODE_ID,
  CLASSIC_ROOT_NODE_ID,
  createEmptyWorkspaceLayout,
  createChatSurface,
  createDiagnosticsSurface,
  createFileNavigatorSurface,
  createGitChangesSurface,
  createLogsSurface,
  createPlaceholderSurface,
  createSearchResultsSurface,
  createSplitNode,
  createTerminalSurface,
  createWindowNode,
  createWorkbenchWindow,
} from '@/features/tiling-surface-manager/utils/layout-builders'
import { layoutNodeId, workbenchWindowId } from '@/features/tiling-surface-manager/utils/layout-ids'
import { normalizeWorkspaceLayout } from '@/features/tiling-surface-manager/utils/layout-normalize'
import {
  createRegisteredSurface,
  defaultSurfaceRegistry,
} from '@/features/tiling-surface-manager/utils/surface-registry'
import type {
  LayoutNode,
  LayoutNodeId,
  Surface,
  SurfaceId,
  WindowId,
  WorkbenchWindow,
  WorkspaceLayout,
} from '@/features/tiling-surface-manager/utils/layout-types'

export type EditorSurfaceSerializedState = {
  readonly editorPaneId: string
  readonly editorTabId: string
}

type EditorSurfaceRecord = {
  readonly paneId: string
  readonly surface: Surface
  readonly tab: EditorPaneTab
}

type EditorSurfaceLayoutContext = {
  activeSurfaceId?: SurfaceId
  activeWindowId?: WindowId
  readonly activeEditorTabId: string | null
  readonly nodesById: Record<string, LayoutNode>
  readonly recordsByTabId: ReadonlyMap<string, EditorSurfaceRecord>
  readonly surfacesById: Record<string, Surface>
  readonly windowsById: Record<string, WorkbenchWindow>
}

export function workspaceLayoutForEditorPaneLayout(layout: EditorPaneLayout): WorkspaceLayout {
  const normalizedLayout = normalizeEditorPaneLayout(layout)
  const recordsByTabId = winningEditorSurfaceRecordsByTabId(normalizedLayout)
  const context = createEditorSurfaceLayoutContext(normalizedLayout, recordsByTabId)
  const rootNodeId = appendEditorPaneNode(normalizedLayout.root, context)
  const baseLayout = createEmptyWorkspaceLayout()

  const editorLayout = {
    ...baseLayout,
    activeSurfaceId: context.activeSurfaceId,
    activeWindowId: context.activeWindowId,
    mruSurfaceIds: visibleSurfaceIds(context),
    mruWindowIds: visibleWindowIds(context),
    nodesById: context.nodesById,
    rootNodeId,
    surfacesById: context.surfacesById,
    windowsById: context.windowsById,
  } satisfies WorkspaceLayout

  return normalizeWorkspaceLayout(layoutWithClassicToolSurfaces(editorLayout))
}

export function editorSurfaceSerializedState(
  surface: Surface,
): EditorSurfaceSerializedState | null {
  if (!isRecord(surface.serializedState)) return null
  if (typeof surface.serializedState.editorPaneId !== 'string') return null
  if (typeof surface.serializedState.editorTabId !== 'string') return null

  return {
    editorPaneId: surface.serializedState.editorPaneId,
    editorTabId: surface.serializedState.editorTabId,
  }
}

export function editorPaneIdForWorkbenchWindowId(windowId: WindowId): string | null {
  const rawId = String(windowId)
  if (!rawId.startsWith('window:')) return null

  const decodedKey = decodeURIComponent(rawId.slice('window:'.length))
  if (!decodedKey.startsWith('editor-pane:')) return null

  return decodedKey.slice('editor-pane:'.length)
}

export function editorPaneLayoutForWorkspaceLayout(layout: WorkspaceLayout): EditorPaneLayout {
  const normalizedLayout = normalizeWorkspaceLayout(layout)
  const root = editorPaneNodeForLayoutRoot(normalizedLayout)
  const activePaneId = activeEditorPaneIdForWorkspaceLayout(normalizedLayout, root)

  return normalizeEditorPaneLayout({
    activePaneId,
    root,
  })
}

export function editorPaneIdForWorkbenchWindow(windowId: WindowId): string {
  return editorPaneIdForWorkbenchWindowId(windowId) ?? `workbench:${windowId}`
}

export function editorTabIdForSurface(surface: Surface): string {
  return editorSurfaceSerializedState(surface)?.editorTabId ?? `surface-tab:${surface.id}`
}

function createEditorSurfaceLayoutContext(
  layout: EditorPaneLayout,
  recordsByTabId: ReadonlyMap<string, EditorSurfaceRecord>,
): EditorSurfaceLayoutContext {
  return {
    activeEditorTabId: activeEditorPaneTab(layout)?.id ?? null,
    nodesById: {},
    recordsByTabId,
    surfacesById: {},
    windowsById: {},
  }
}

function appendEditorPaneNode(
  node: EditorPaneNode,
  context: EditorSurfaceLayoutContext,
): LayoutNodeId {
  if (node.kind === 'leaf') return appendEditorPaneLeaf(node, context)

  return appendEditorPaneSplit(node, context)
}

function appendEditorPaneLeaf(
  pane: EditorPaneLeaf,
  context: EditorSurfaceLayoutContext,
): LayoutNodeId {
  const windowId = editorPaneWindowId(pane.id)
  const nodeId = editorPaneNodeId(pane.id)
  const surfaces = paneSurfaces(pane, context.recordsByTabId)
  const windowSurfaces = surfaces.length > 0 ? surfaces : [placeholderSurfaceForPane(pane.id)]
  const activeSurface = activeSurfaceForPane(pane, windowSurfaces, context.activeEditorTabId)
  const window = createWorkbenchWindow({
    activeSurfaceId: activeSurface.id,
    id: windowId,
    surfaceIds: windowSurfaces.map((surface) => surface.id),
  })

  appendSurfaces(context, windowSurfaces)
  context.nodesById[nodeId] = createWindowNode({ id: nodeId, windowId })
  context.windowsById[windowId] = window
  updateActiveEditorSurface(context, pane, activeSurface, windowId)

  return nodeId
}

function appendEditorPaneSplit(
  node: Extract<EditorPaneNode, { readonly kind: 'split' }>,
  context: EditorSurfaceLayoutContext,
): LayoutNodeId {
  const childIds = node.children.map((child) => appendEditorPaneNode(child, context))
  const nodeId = editorPaneNodeId(node.id)

  context.nodesById[nodeId] = createSplitNode({
    axis: node.direction,
    childIds,
    id: nodeId,
    sizes: node.sizes,
  })

  return nodeId
}

function winningEditorSurfaceRecordsByTabId(layout: EditorPaneLayout) {
  const records = editorSurfaceRecords(layout)
  const activeTabId = activeEditorPaneTab(layout)?.id ?? null
  const recordsBySurfaceId = new Map<SurfaceId, EditorSurfaceRecord>()

  for (const record of records) {
    const current = recordsBySurfaceId.get(record.surface.id)
    if (current && record.tab.id !== activeTabId) continue

    recordsBySurfaceId.set(record.surface.id, record)
  }

  return new Map(Array.from(recordsBySurfaceId.values()).map((record) => [record.tab.id, record]))
}

function editorSurfaceRecords(layout: EditorPaneLayout): readonly EditorSurfaceRecord[] {
  return collectEditorSurfaceRecords(layout.root)
}

function collectEditorSurfaceRecords(node: EditorPaneNode): readonly EditorSurfaceRecord[] {
  if (node.kind === 'leaf') return editorPaneSurfaceRecords(node)

  return node.children.flatMap(collectEditorSurfaceRecords)
}

function editorPaneSurfaceRecords(pane: EditorPaneLeaf): readonly EditorSurfaceRecord[] {
  const records: EditorSurfaceRecord[] = []

  for (const tab of pane.tabs) {
    const surface = surfaceForEditorTab(pane.id, tab)
    if (!surface) continue

    records.push({ paneId: pane.id, surface, tab })
  }

  return records
}

function surfaceForEditorTab(paneId: string, tab: EditorPaneTab): Surface | null {
  const serializedState = {
    editorPaneId: paneId,
    editorTabId: tab.id,
  } satisfies EditorSurfaceSerializedState
  const diff = parseDiffDocumentId(tab.path)

  if (diff) {
    return createRegisteredSurface(defaultSurfaceRegistry, {
      diffDocumentId: tab.path,
      serializedState,
      type: 'diff',
    })
  }

  return createRegisteredSurface(defaultSurfaceRegistry, {
    path: tab.path,
    serializedState,
    type: 'file-editor',
  })
}

function paneSurfaces(
  pane: EditorPaneLeaf,
  recordsByTabId: ReadonlyMap<string, EditorSurfaceRecord>,
): readonly Surface[] {
  return pane.tabs.flatMap((tab) => {
    const record = recordsByTabId.get(tab.id)
    if (!record) return []

    return [record.surface]
  })
}

function activeSurfaceForPane(
  pane: EditorPaneLeaf,
  surfaces: readonly Surface[],
  activeEditorTabId: string | null,
) {
  const activeTabId = activeTabForPane(pane)?.id ?? null
  const activeSurface = surfaces.find((surface) => {
    const state = editorSurfaceSerializedState(surface)
    return state?.editorTabId === activeTabId
  })
  if (activeSurface) return activeSurface

  const activeEditorSurface = surfaces.find((surface) => {
    const state = editorSurfaceSerializedState(surface)
    return state?.editorTabId === activeEditorTabId
  })
  return activeEditorSurface ?? surfaces[0]
}

function placeholderSurfaceForPane(paneId: string): Surface {
  return createPlaceholderSurface({
    contextKey: `editor-pane:${paneId}`,
    title: 'No file selected',
  })
}

function editorPaneNodeForLayoutRoot(layout: WorkspaceLayout): EditorPaneNode {
  const rootNode = layout.rootNodeId
    ? editorPaneNodeForLayoutNode(layout, layout.rootNodeId, new Set())
    : null

  return rootNode ?? emptyEditorPaneLeaf('empty')
}

function editorPaneNodeForLayoutNode(
  layout: WorkspaceLayout,
  nodeId: LayoutNodeId,
  seenNodeIds: Set<LayoutNodeId>,
): EditorPaneNode | null {
  if (seenNodeIds.has(nodeId)) return null

  const node = layout.nodesById[nodeId]
  if (!node) return null
  if (node.kind === 'window') return editorPaneLeafForWindow(layout, node.windowId)

  return editorPaneSplitForLayoutNode(layout, node, new Set(seenNodeIds).add(nodeId))
}

function editorPaneSplitForLayoutNode(
  layout: WorkspaceLayout,
  node: Extract<LayoutNode, { readonly kind: 'split' }>,
  seenNodeIds: Set<LayoutNodeId>,
): EditorPaneNode | null {
  const children = node.childIds.flatMap((childId) => {
    const child = editorPaneNodeForLayoutNode(layout, childId, seenNodeIds)
    return child ? [child] : []
  })
  if (children.length === 0) return null
  if (children.length === 1) return children[0]

  return {
    children,
    direction: node.axis,
    id: String(node.id),
    kind: 'split',
    sizes: node.sizes,
  } satisfies EditorPaneSplit
}

function editorPaneLeafForWindow(
  layout: WorkspaceLayout,
  windowId: WindowId,
): EditorPaneLeaf | null {
  const window = layout.windowsById[windowId]
  const paneId = editorPaneIdForWorkbenchWindow(windowId)
  if (!window) return emptyEditorPaneLeaf(paneId)

  const tabs = editorPaneTabsForWindow(layout, window)
  if (tabs.length === 0 && !editorPaneIdForWorkbenchWindowId(windowId)) return null

  return {
    activeTabId: activeEditorTabIdForWindow(layout, window, tabs),
    id: paneId,
    kind: 'leaf',
    tabs,
  }
}

function editorPaneTabsForWindow(
  layout: WorkspaceLayout,
  window: WorkbenchWindow,
): EditorPaneTab[] {
  const tabs: EditorPaneTab[] = []

  for (const surfaceId of window.surfaceIds) {
    const tab = editorPaneTabForSurface(layout.surfacesById[surfaceId])
    if (!tab) continue

    tabs.push(tab)
  }

  return tabs
}

function editorPaneTabForSurface(surface: Surface | undefined): EditorPaneTab | null {
  if (!surface?.resourceKey) return null
  if (surface.type !== 'file-editor' && surface.type !== 'diff') return null

  return {
    id: editorTabIdForSurface(surface),
    path: surface.resourceKey,
  }
}

function activeEditorTabIdForWindow(
  layout: WorkspaceLayout,
  window: WorkbenchWindow,
  tabs: readonly EditorPaneTab[],
) {
  const activeSurface = layout.surfacesById[window.activeSurfaceId]
  const activeTabId = activeSurface ? editorTabIdForSurface(activeSurface) : null
  if (activeTabId && tabs.some((tab) => tab.id === activeTabId)) return activeTabId

  return tabs.at(0)?.id ?? null
}

function activeEditorPaneIdForWorkspaceLayout(
  layout: WorkspaceLayout,
  root: EditorPaneNode,
): string {
  const windowId = layout.activeWindowId
  const activePaneId = windowId ? editorPaneIdForWorkbenchWindow(windowId) : null
  if (activePaneId && editorPaneNodeHasPane(root, activePaneId)) return activePaneId

  return firstEditorPaneId(root) ?? 'empty'
}

function editorPaneNodeHasPane(node: EditorPaneNode, paneId: string): boolean {
  if (node.kind === 'leaf') return node.id === paneId

  return node.children.some((child) => editorPaneNodeHasPane(child, paneId))
}

function firstEditorPaneId(node: EditorPaneNode): string | null {
  if (node.kind === 'leaf') return node.id

  for (const child of node.children) {
    const paneId = firstEditorPaneId(child)
    if (paneId) return paneId
  }

  return null
}

function emptyEditorPaneLeaf(id: string): EditorPaneLeaf {
  return {
    activeTabId: null,
    id,
    kind: 'leaf',
    tabs: [],
  }
}

function appendSurfaces(
  context: Pick<EditorSurfaceLayoutContext, 'surfacesById'>,
  surfaces: readonly Surface[],
) {
  for (const surface of surfaces) {
    context.surfacesById[surface.id] = surface
  }
}

function updateActiveEditorSurface(
  context: EditorSurfaceLayoutContext,
  pane: EditorPaneLeaf,
  activeSurface: Surface,
  windowId: WindowId,
) {
  const activeTabId = activeTabForPane(pane)?.id ?? null
  if (activeTabId !== context.activeEditorTabId) return

  context.activeSurfaceId = activeSurface.id
  context.activeWindowId = windowId
}

function visibleSurfaceIds(context: EditorSurfaceLayoutContext) {
  return Object.values(context.windowsById).flatMap((window) => window.surfaceIds)
}

function visibleWindowIds(context: EditorSurfaceLayoutContext) {
  return Object.values(context.windowsById).map((window) => window.id)
}

function layoutWithClassicToolSurfaces(layout: WorkspaceLayout): WorkspaceLayout {
  if (!layout.rootNodeId) return layout

  const fileNavigator = createFileNavigatorSurface()
  const searchResults = createSearchResultsSurface()
  const gitChanges = createGitChangesSurface()
  const chat = createChatSurface()
  const logs = createLogsSurface()
  const diagnostics = createDiagnosticsSurface()
  const terminal = createTerminalSurface({ sessionId: 'terminal-1' })
  const fileNavigatorWindow = createWorkbenchWindow({
    activeSurfaceId: fileNavigator.id,
    id: CLASSIC_FILE_NAVIGATOR_WINDOW_ID,
    pinnedSurfaceIds: [fileNavigator.id],
    surfaceIds: [fileNavigator.id],
  })
  const diagnosticsWindow = createWorkbenchWindow({
    activeSurfaceId: terminal.id,
    id: CLASSIC_DIAGNOSTICS_WINDOW_ID,
    pinnedSurfaceIds: [diagnostics.id],
    surfaceIds: [diagnostics.id, terminal.id],
  })

  return {
    ...layout,
    mruSurfaceIds: [...layout.mruSurfaceIds, fileNavigator.id, terminal.id, diagnostics.id],
    mruWindowIds: [...layout.mruWindowIds, fileNavigatorWindow.id, diagnosticsWindow.id],
    nodesById: {
      ...layout.nodesById,
      [CLASSIC_DIAGNOSTICS_NODE_ID]: createWindowNode({
        id: CLASSIC_DIAGNOSTICS_NODE_ID,
        windowId: diagnosticsWindow.id,
      }),
      [CLASSIC_FILE_NAVIGATOR_NODE_ID]: createWindowNode({
        id: CLASSIC_FILE_NAVIGATOR_NODE_ID,
        windowId: fileNavigatorWindow.id,
      }),
      [CLASSIC_MAIN_NODE_ID]: createSplitNode({
        axis: 'vertical',
        childIds: [layout.rootNodeId, CLASSIC_DIAGNOSTICS_NODE_ID],
        id: CLASSIC_MAIN_NODE_ID,
        sizes: [0.74, 0.26],
      }),
      [CLASSIC_ROOT_NODE_ID]: createSplitNode({
        axis: 'horizontal',
        childIds: [CLASSIC_FILE_NAVIGATOR_NODE_ID, CLASSIC_MAIN_NODE_ID],
        id: CLASSIC_ROOT_NODE_ID,
        sizes: [0.22, 0.78],
      }),
    },
    rail: {
      minimizedSurfaceIds: [searchResults.id, gitChanges.id, chat.id, logs.id],
      pinnedSurfaceIds: [
        fileNavigator.id,
        searchResults.id,
        gitChanges.id,
        chat.id,
        diagnostics.id,
        logs.id,
      ],
      recipeIds: layout.rail.recipeIds,
      runningSurfaceIds: [terminal.id],
      visibleSingletonSurfaceIds: [fileNavigator.id, diagnostics.id],
    },
    rootNodeId: CLASSIC_ROOT_NODE_ID,
    surfacesById: {
      ...layout.surfacesById,
      [diagnostics.id]: diagnostics,
      [fileNavigator.id]: fileNavigator,
      [gitChanges.id]: gitChanges,
      [chat.id]: chat,
      [logs.id]: logs,
      [searchResults.id]: searchResults,
      [terminal.id]: terminal,
    },
    windowsById: {
      ...layout.windowsById,
      [diagnosticsWindow.id]: diagnosticsWindow,
      [fileNavigatorWindow.id]: fileNavigatorWindow,
    },
  }
}

function editorPaneWindowId(paneId: string): WindowId {
  return workbenchWindowId(`editor-pane:${paneId}`)
}

function editorPaneNodeId(paneId: string): LayoutNodeId {
  return layoutNodeId(`editor-pane:${paneId}`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
