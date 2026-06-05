import {
  activeEditorPaneTab,
  activeTabForPane,
  normalizeEditorPaneLayout,
  type EditorPaneLeaf,
  type EditorPaneLayout,
  type EditorPaneNode,
  type EditorPaneTab,
} from '@/features/editor/state/editor-pane-state'
import { parseDiffDocumentId } from '@/features/git/diff-document'

import {
  createEmptyWorkspaceLayout,
  createPlaceholderSurface,
  createSplitNode,
  createWindowNode,
  createWorkbenchWindow,
} from './layout-builders'
import { layoutNodeId, workbenchWindowId } from './layout-ids'
import { normalizeWorkspaceLayout } from './layout-normalize'
import { createRegisteredSurface, defaultSurfaceRegistry } from './surface-registry'
import type {
  LayoutNode,
  LayoutNodeId,
  Surface,
  SurfaceId,
  WindowId,
  WorkbenchWindow,
  WorkspaceLayout,
} from './layout-types'

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

  return normalizeWorkspaceLayout({
    ...baseLayout,
    activeSurfaceId: context.activeSurfaceId,
    activeWindowId: context.activeWindowId,
    mruSurfaceIds: visibleSurfaceIds(context),
    mruWindowIds: visibleWindowIds(context),
    nodesById: context.nodesById,
    rootNodeId,
    surfacesById: context.surfacesById,
    windowsById: context.windowsById,
  })
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

function editorPaneWindowId(paneId: string): WindowId {
  return workbenchWindowId(`editor-pane:${paneId}`)
}

function editorPaneNodeId(paneId: string): LayoutNodeId {
  return layoutNodeId(`editor-pane:${paneId}`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
