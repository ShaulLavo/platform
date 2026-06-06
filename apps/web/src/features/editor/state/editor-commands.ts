import { fallbackDocumentPathForSelection } from '@/features/editor/state/editor-fallback-path'
import {
  createEditorPaneTab,
  type EditorPaneDropZone,
  type EditorPaneSplitDirection,
  type EditorPaneSplitScope,
} from '@/features/editor/state/editor-pane-state'
import {
  useEditorDocumentStoreApi,
  type EditorDocumentStoreApi,
} from '@/features/editor/state/editor-document-state'
import {
  editorHistoryForClosedPath,
  editorHistoryForRenamedPath,
  editorHistoryForSelection,
  previousOpenEditorPath,
  recentlyClosedEditorPathsForClose,
  recentlyClosedEditorPathsForReopen,
} from '@/features/editor/state/editor-tab-paths'
import { useEditorUiStoreApi, type EditorUiStoreApi } from '@/features/editor/state/editor-ui-state'
import {
  editorWorkspaceSelectionForWorkspaceLayout,
  useEditorWorkspaceStoreApi,
  type EditorWorkspaceStore,
  type EditorWorkspaceStoreApi,
} from '@/features/editor/state/editor-workspace-state'
import { parseDiffDocumentId } from '@/features/git/diff-document'
import {
  createDiffSurface,
  createFileEditorSurface,
} from '@/features/tiling-surface-manager/engine/layout-builders'
import {
  activateSurface,
  closeSurface as closeSurfaceInLayout,
  moveSurface,
  openSurface,
  reorderSurface,
  tabSurface,
} from '@/features/tiling-surface-manager/engine/layout-operations'
import { findWindowIdContainingSurface } from '@/features/tiling-surface-manager/engine/layout-normalize'
import type {
  DropDestination,
  DropEdge,
  Surface,
  SurfaceId,
  WindowId,
  WorkspaceLayout,
} from '@/features/tiling-surface-manager/engine/layout-types'
import {
  editorPaneIdForWorkbenchWindow,
  editorSurfaceSerializedState,
} from '@/features/workbench/utils/editor-surface-layout'
import type { PickedFsEntry } from '@/lib/file-system-types'
import type { LanguageServerDefinitionTarget } from '@editor/lsp-plugin'
import { useMemo } from 'react'

export type EditorCommands = {
  closeTab: (tabId: string) => void
  discardAndCloseTab: (tabId: string) => { wasDirty: boolean }
  discardLiveEditorDocument: (path: string) => { wasDirty: boolean }
  moveTabToPane: (tabId: string, paneId: string, targetIndex?: number) => boolean
  moveTabToSplit: (
    tabId: string,
    paneId: string,
    zone: Exclude<EditorPaneDropZone, 'center'>,
    scope?: EditorPaneSplitScope,
  ) => boolean
  openDefinition: (target: LanguageServerDefinitionTarget) => boolean
  pickRootFolder: (rootFolder: PickedFsEntry) => void
  reopenClosedEditor: () => boolean
  renameLiveEditorDocument: (from: string, to: string) => { wasDirty: boolean }
  reorderTab: (paneId: string, tabId: string, targetIndex: number) => boolean
  selectFile: (path: string | null) => void
  selectPreviousEditor: () => boolean
  selectTab: (paneId: string, tabId: string) => void
  setActivePane: (paneId: string) => void
  splitTab: (tabId: string, direction: EditorPaneSplitDirection) => boolean
}

export function useEditorCommands() {
  const documentStore = useEditorDocumentStoreApi()
  const uiStore = useEditorUiStoreApi()
  const workspaceStore = useEditorWorkspaceStoreApi()

  return useMemo(
    () => createEditorCommands({ documentStore, uiStore, workspaceStore }),
    [documentStore, uiStore, workspaceStore],
  )
}

export function createEditorCommands({
  documentStore,
  uiStore,
  workspaceStore,
}: {
  documentStore: EditorDocumentStoreApi
  uiStore: EditorUiStoreApi
  workspaceStore: EditorWorkspaceStoreApi
}): EditorCommands {
  return {
    closeTab: (tabId) => closeTab(tabId, workspaceStore, documentStore, uiStore),
    discardAndCloseTab: (tabId) =>
      closeTab(tabId, workspaceStore, documentStore, uiStore, {
        discard: true,
      }),
    discardLiveEditorDocument: (path) =>
      discardLiveEditorDocument(path, workspaceStore, documentStore, uiStore),
    moveTabToPane: (tabId, paneId, targetIndex) =>
      moveTabToPane(tabId, paneId, targetIndex, workspaceStore),
    moveTabToSplit: (tabId, paneId, zone, scope) =>
      moveTabToSplit(tabId, paneId, zone, scope, workspaceStore),
    openDefinition: (target) => openDefinition(target, workspaceStore, documentStore, uiStore),
    pickRootFolder: (rootFolder) =>
      pickRootFolder(rootFolder, workspaceStore, documentStore, uiStore),
    reopenClosedEditor: () => reopenClosedEditor(workspaceStore, documentStore),
    renameLiveEditorDocument: (from, to) =>
      renameLiveEditorDocument(from, to, workspaceStore, documentStore, uiStore),
    reorderTab: (paneId, tabId, targetIndex) =>
      reorderTab(paneId, tabId, targetIndex, workspaceStore),
    selectFile: (path) => selectFile(path, workspaceStore, documentStore),
    selectPreviousEditor: () => selectPreviousEditor(workspaceStore, documentStore),
    selectTab: (paneId, tabId) => selectTab(paneId, tabId, workspaceStore, documentStore),
    setActivePane: (paneId) => setActivePane(paneId, workspaceStore),
    splitTab: (tabId, direction) => splitTab(tabId, direction, workspaceStore),
  }
}

function selectFile(
  selectedFilePath: string | null,
  workspaceStore: EditorWorkspaceStoreApi,
  documentStore: EditorDocumentStoreApi,
) {
  if (!selectedFilePath) return

  const workspace = workspaceStore.getState()
  const document = documentStore.getState()
  const workspaceLayout = openEditorPathInWorkspaceLayout(
    workspace.workspaceLayout,
    selectedFilePath,
  )

  documentStore.setState({
    fallbackDocumentPath: fallbackDocumentPathForSelection(
      document.hasLiveEditorDocument,
      workspace.selectedFilePath,
      document.fallbackDocumentPath,
    ),
  })
  workspaceStore.setState({
    ...editorWorkspaceSelectionForWorkspaceLayoutForState(workspace, workspaceLayout),
    editorHistory: editorHistoryForSelection(workspace.editorHistory, selectedFilePath),
  })
}

function openDefinition(
  definitionTarget: LanguageServerDefinitionTarget,
  workspaceStore: EditorWorkspaceStoreApi,
  documentStore: EditorDocumentStoreApi,
  uiStore: EditorUiStoreApi,
) {
  selectFile(definitionTarget.path, workspaceStore, documentStore)
  uiStore.setState({
    definitionTarget,
    statusBarSource: null,
  })

  return true
}

function pickRootFolder(
  rootFolder: PickedFsEntry,
  workspaceStore: EditorWorkspaceStoreApi,
  documentStore: EditorDocumentStoreApi,
  uiStore: EditorUiStoreApi,
) {
  documentStore.getState().clearLiveEditorDocuments()
  uiStore.getState().resetEditorUiState()
  workspaceStore.getState().resetForRootFolder(rootFolder)
}

function closeTab(
  tabId: string,
  workspaceStore: EditorWorkspaceStoreApi,
  documentStore: EditorDocumentStoreApi,
  uiStore: EditorUiStoreApi,
  options: { discard?: boolean } = {},
) {
  const workspace = workspaceStore.getState()
  const location = editorSurfaceLocationForTabId(workspace.workspaceLayout, tabId)
  if (!location) return { wasDirty: false }
  if (!location.surface.resourceKey) return { wasDirty: false }

  const path = location.surface.resourceKey
  const nextLayout = closeSurfaceInLayout(workspace.workspaceLayout, location.surface.id)
  const nextSelection = editorWorkspaceSelectionForWorkspaceLayoutForState(workspace, nextLayout)
  const remainingCount = editorSurfacePathCounts(nextLayout).get(path) ?? 0
  const result =
    options.discard && remainingCount === 0
      ? documentStore.getState().deleteLiveEditorDocument(path)
      : { wasDirty: false }

  if (!options.discard || remainingCount > 0) {
    documentStore.getState().removeEditorView(tabId)
    if (remainingCount === 0) {
      documentStore.getState().evictCleanUnviewedLiveEditorDocument(path)
    }
  }

  const selectedFilePath = nextSelection.selectedFilePath
  updateUiForClosedPath(path, selectedFilePath, remainingCount, uiStore)
  updateFallbackForClosedPath(path, selectedFilePath, documentStore)
  workspaceStore.setState({
    ...nextSelection,
    editorHistory:
      remainingCount === 0
        ? editorHistoryForClosedPath(workspace.editorHistory, path)
        : workspace.editorHistory,
    recentlyClosedEditorPaths: recentlyClosedEditorPathsForClose(
      workspace.recentlyClosedEditorPaths,
      path,
    ),
  })

  return result
}

function discardLiveEditorDocument(
  path: string,
  workspaceStore: EditorWorkspaceStoreApi,
  documentStore: EditorDocumentStoreApi,
  uiStore: EditorUiStoreApi,
) {
  const workspace = workspaceStore.getState()
  const result = documentStore.getState().deleteLiveEditorDocument(path)
  const nextLayout = closeEditorPathSurfaces(workspace.workspaceLayout, path)
  const nextSelection = editorWorkspaceSelectionForWorkspaceLayoutForState(workspace, nextLayout)
  const selectedFilePath = nextSelection.selectedFilePath

  updateUiForClosedPath(path, selectedFilePath, 0, uiStore)
  updateFallbackForClosedPath(path, selectedFilePath, documentStore)
  workspaceStore.setState({
    ...nextSelection,
    editorHistory: editorHistoryForClosedPath(workspace.editorHistory, path),
  })

  return { wasDirty: result.wasDirty }
}

function reopenClosedEditor(
  workspaceStore: EditorWorkspaceStoreApi,
  documentStore: EditorDocumentStoreApi,
) {
  const workspace = workspaceStore.getState()
  const path = workspace.recentlyClosedEditorPaths[0]
  if (!path) return false

  selectFile(path, workspaceStore, documentStore)
  workspaceStore.setState((state) => ({
    recentlyClosedEditorPaths: recentlyClosedEditorPathsForReopen(
      state.recentlyClosedEditorPaths,
      path,
    ),
  }))
  return true
}

function selectPreviousEditor(
  workspaceStore: EditorWorkspaceStoreApi,
  documentStore: EditorDocumentStoreApi,
) {
  const workspace = workspaceStore.getState()
  const path = previousOpenEditorPath(
    workspace.editorHistory,
    workspace.openFilePaths,
    workspace.selectedFilePath,
  )
  if (!path) return false

  selectFile(path, workspaceStore, documentStore)
  return true
}

function renameLiveEditorDocument(
  from: string,
  to: string,
  workspaceStore: EditorWorkspaceStoreApi,
  documentStore: EditorDocumentStoreApi,
  uiStore: EditorUiStoreApi,
) {
  const workspace = workspaceStore.getState()
  const result = documentStore.getState().renameLiveEditorDocumentPath(from, to)
  const workspaceLayout = renameEditorPathInWorkspaceLayout(workspace.workspaceLayout, from, to)
  workspaceStore.setState({
    ...editorWorkspaceSelectionForWorkspaceLayoutForState(workspace, workspaceLayout),
    editorHistory: editorHistoryForRenamedPath(workspace.editorHistory, from, to),
    recentlyClosedEditorPaths: editorHistoryForRenamedPath(
      workspace.recentlyClosedEditorPaths,
      from,
      to,
    ),
  })
  uiStore.getState().renameDefinitionTargetPath(from, to)
  uiStore.getState().renameLanguageServerReferencesPath(from, to)

  return result
}

function reorderTab(
  _paneId: string,
  tabId: string,
  targetIndex: number,
  workspaceStore: EditorWorkspaceStoreApi,
) {
  const workspace = workspaceStore.getState()
  const location = editorSurfaceLocationForTabId(workspace.workspaceLayout, tabId)
  if (!location) return false
  if (location.index === targetIndex) return false

  workspaceStore.setState(
    editorWorkspaceSelectionForWorkspaceLayoutForState(
      workspace,
      reorderSurface(workspace.workspaceLayout, location.windowId, location.index, targetIndex),
    ),
  )
  return true
}

function selectTab(
  _paneId: string,
  tabId: string,
  workspaceStore: EditorWorkspaceStoreApi,
  documentStore: EditorDocumentStoreApi,
) {
  const workspace = workspaceStore.getState()
  const location = editorSurfaceLocationForTabId(workspace.workspaceLayout, tabId)
  if (!location) return
  if (surfaceLocationIsActive(workspace.workspaceLayout, location)) return

  const workspaceLayout = activateSurface(workspace.workspaceLayout, location.surface.id)
  const nextSelection = editorWorkspaceSelectionForWorkspaceLayoutForState(
    workspace,
    workspaceLayout,
  )
  const selectedFilePath = nextSelection.selectedFilePath
  const document = documentStore.getState()

  documentStore.setState({
    fallbackDocumentPath: fallbackDocumentPathForSelection(
      document.hasLiveEditorDocument,
      workspace.selectedFilePath,
      document.fallbackDocumentPath,
    ),
  })
  workspaceStore.setState({
    ...nextSelection,
    editorHistory: editorHistoryForSelection(workspace.editorHistory, selectedFilePath),
  })
}

function setActivePane(paneId: string, workspaceStore: EditorWorkspaceStoreApi) {
  const workspace = workspaceStore.getState()
  const windowId = windowIdForEditorPaneId(workspace.workspaceLayout, paneId)
  if (!windowId) return
  const activeSurfaceId = workspace.workspaceLayout.windowsById[windowId]?.activeSurfaceId
  if (!activeSurfaceId) return

  workspaceStore.setState(
    editorWorkspaceSelectionForWorkspaceLayoutForState(
      workspace,
      activateSurface(workspace.workspaceLayout, activeSurfaceId),
    ),
  )
}

function splitTab(
  tabId: string,
  direction: EditorPaneSplitDirection,
  workspaceStore: EditorWorkspaceStoreApi,
) {
  const workspace = workspaceStore.getState()
  const location = editorSurfaceLocationForTabId(workspace.workspaceLayout, tabId)
  if (!location) return false

  workspaceStore.setState(
    editorWorkspaceSelectionForWorkspaceLayoutForState(
      workspace,
      moveSurface(workspace.workspaceLayout, location.surface.id, {
        edge: edgeForEditorSplitDirection(direction),
        kind: 'window-edge',
        windowId: location.windowId,
      }),
    ),
  )
  return true
}

function moveTabToPane(
  tabId: string,
  paneId: string,
  targetIndex: number | undefined,
  workspaceStore: EditorWorkspaceStoreApi,
) {
  const workspace = workspaceStore.getState()
  const location = editorSurfaceLocationForTabId(workspace.workspaceLayout, tabId)
  const targetWindowId = windowIdForEditorPaneId(workspace.workspaceLayout, paneId)
  if (!location || !targetWindowId) return false

  workspaceStore.setState(
    editorWorkspaceSelectionForWorkspaceLayoutForState(
      workspace,
      tabSurface(workspace.workspaceLayout, location.surface.id, targetWindowId, targetIndex),
    ),
  )
  return true
}

function moveTabToSplit(
  tabId: string,
  paneId: string,
  zone: Exclude<EditorPaneDropZone, 'center'>,
  scope: EditorPaneSplitScope | undefined,
  workspaceStore: EditorWorkspaceStoreApi,
) {
  const workspace = workspaceStore.getState()
  const location = editorSurfaceLocationForTabId(workspace.workspaceLayout, tabId)
  const targetWindowId = windowIdForEditorPaneId(workspace.workspaceLayout, paneId)
  if (!location || !targetWindowId) return false

  workspaceStore.setState(
    editorWorkspaceSelectionForWorkspaceLayoutForState(
      workspace,
      moveSurface(
        workspace.workspaceLayout,
        location.surface.id,
        splitDestination(targetWindowId, zone, scope),
      ),
    ),
  )
  return true
}

function editorWorkspaceSelectionForWorkspaceLayoutForState(
  workspace: EditorWorkspaceStore,
  workspaceLayout: WorkspaceLayout,
) {
  return editorWorkspaceSelectionForWorkspaceLayout(workspaceLayout, {
    currentOpenFilePaths: workspace.openFilePaths,
  })
}

function openEditorPathInWorkspaceLayout(layout: WorkspaceLayout, path: string) {
  const existingSurface = editorSurfaceForPath(layout, path)
  if (existingSurface) return activateSurface(layout, existingSurface.id)

  return openSurface(layout, createEditorSurfaceForPath(layout, path))
}

function createEditorSurfaceForPath(layout: WorkspaceLayout, path: string): Surface {
  const tab = createEditorPaneTab(path)
  const serializedState = {
    editorPaneId: editorPaneIdForNewSurface(layout),
    editorTabId: tab.id,
  }
  const surface = parseDiffDocumentId(path)
    ? createDiffSurface({ diffDocumentId: path })
    : createFileEditorSurface({ path })

  return { ...surface, serializedState }
}

function editorPaneIdForNewSurface(layout: WorkspaceLayout) {
  const windowId = layout.activeWindowId
  if (!windowId) return 'workbench:root'

  return editorPaneIdForWorkbenchWindow(windowId)
}

function closeEditorPathSurfaces(layout: WorkspaceLayout, path: string) {
  let nextLayout = layout
  for (const surface of editorSurfacesForPath(layout, path)) {
    nextLayout = closeSurfaceInLayout(nextLayout, surface.id)
  }

  return nextLayout
}

function renameEditorPathInWorkspaceLayout(
  layout: WorkspaceLayout,
  from: string,
  to: string,
): WorkspaceLayout {
  let nextLayout = layout
  for (const surface of editorSurfacesForPath(layout, from)) {
    nextLayout = replaceFileEditorSurfacePath(nextLayout, surface, to)
  }

  return nextLayout
}

function replaceFileEditorSurfacePath(
  layout: WorkspaceLayout,
  surface: Surface,
  path: string,
): WorkspaceLayout {
  if (surface.type !== 'file-editor') return layout

  const replacement = {
    ...createFileEditorSurface({ path }),
    serializedState: surface.serializedState,
  }

  return replaceSurface(layout, surface.id, replacement)
}

function replaceSurface(
  layout: WorkspaceLayout,
  surfaceId: SurfaceId,
  replacement: Surface,
): WorkspaceLayout {
  const surfacesById = { ...layout.surfacesById }
  delete surfacesById[surfaceId]
  surfacesById[replacement.id] = replacement

  return {
    ...layout,
    activeSurfaceId: replaceSurfaceId(layout.activeSurfaceId, surfaceId, replacement.id),
    mruSurfaceIds: replaceSurfaceIds(layout.mruSurfaceIds, surfaceId, replacement.id),
    rail: {
      ...layout.rail,
      backgroundSurfaceIds: replaceSurfaceIds(
        layout.rail.backgroundSurfaceIds,
        surfaceId,
        replacement.id,
      ),
      pinnedSurfaceIds: replaceSurfaceIds(layout.rail.pinnedSurfaceIds, surfaceId, replacement.id),
      runningSurfaceIds: replaceSurfaceIds(
        layout.rail.runningSurfaceIds,
        surfaceId,
        replacement.id,
      ),
      visibleSingletonSurfaceIds: replaceSurfaceIds(
        layout.rail.visibleSingletonSurfaceIds,
        surfaceId,
        replacement.id,
      ),
    },
    surfacesById,
    windowsById: replaceWindowSurfaceIds(layout, surfaceId, replacement.id),
  }
}

function replaceWindowSurfaceIds(
  layout: WorkspaceLayout,
  surfaceId: SurfaceId,
  replacementId: SurfaceId,
) {
  return Object.fromEntries(
    Object.entries(layout.windowsById).map(([windowId, window]) => [
      windowId,
      {
        ...window,
        activeSurfaceId: replaceSurfaceId(window.activeSurfaceId, surfaceId, replacementId),
        pinnedSurfaceIds: replaceSurfaceIds(window.pinnedSurfaceIds, surfaceId, replacementId),
        previewSurfaceId: replaceSurfaceId(window.previewSurfaceId, surfaceId, replacementId),
        surfaceIds: replaceSurfaceIds(window.surfaceIds, surfaceId, replacementId),
      },
    ]),
  )
}

function replaceSurfaceIds(
  surfaceIds: readonly SurfaceId[],
  surfaceId: SurfaceId,
  replacementId: SurfaceId,
) {
  return surfaceIds.map((id) => replaceSurfaceId(id, surfaceId, replacementId))
}

function replaceSurfaceId<TId extends SurfaceId | undefined>(
  value: TId,
  surfaceId: SurfaceId,
  replacementId: SurfaceId,
): TId {
  return (value === surfaceId ? replacementId : value) as TId
}

function editorSurfaceForPath(layout: WorkspaceLayout, path: string): Surface | null {
  return editorSurfacesForPath(layout, path)[0] ?? null
}

function editorSurfacesForPath(layout: WorkspaceLayout, path: string) {
  return Object.values(layout.surfacesById).filter((surface) => editorSurfacePath(surface) === path)
}

function editorSurfacePath(surface: Surface) {
  if (surface.type !== 'file-editor' && surface.type !== 'diff') return null

  return surface.resourceKey ?? null
}

function editorSurfaceLocationForTabId(layout: WorkspaceLayout, tabId: string) {
  for (const window of Object.values(layout.windowsById)) {
    const location = editorSurfaceLocationInWindow(layout, window.id, tabId)
    if (location) return location
  }

  return null
}

function editorSurfaceLocationInWindow(layout: WorkspaceLayout, windowId: WindowId, tabId: string) {
  const window = layout.windowsById[windowId]
  if (!window) return null

  const index = window.surfaceIds.findIndex((surfaceId) => {
    const surface = layout.surfacesById[surfaceId]
    if (!surface) return false

    return editorSurfaceSerializedState(surface)?.editorTabId === tabId
  })
  if (index < 0) return null

  const surface = layout.surfacesById[window.surfaceIds[index]]
  if (!surface) return null

  return { index, surface, windowId }
}

function surfaceLocationIsActive(
  layout: WorkspaceLayout,
  location: NonNullable<ReturnType<typeof editorSurfaceLocationForTabId>>,
) {
  if (layout.activeSurfaceId !== location.surface.id) return false

  return layout.activeWindowId === location.windowId
}

function editorSurfacePathCounts(layout: WorkspaceLayout) {
  const counts = new Map<string, number>()
  for (const surface of Object.values(layout.surfacesById)) {
    const path = editorSurfacePath(surface)
    if (!path) continue

    counts.set(path, (counts.get(path) ?? 0) + 1)
  }

  return counts
}

function windowIdForEditorPaneId(layout: WorkspaceLayout, paneId: string): WindowId | null {
  for (const window of Object.values(layout.windowsById)) {
    if (editorPaneIdForWorkbenchWindow(window.id) === paneId) return window.id
  }

  return windowIdForSerializedEditorPaneId(layout, paneId)
}

function windowIdForSerializedEditorPaneId(
  layout: WorkspaceLayout,
  paneId: string,
): WindowId | null {
  for (const surface of Object.values(layout.surfacesById)) {
    if (editorSurfaceSerializedState(surface)?.editorPaneId !== paneId) continue

    return findWindowIdContainingSurface(layout, surface.id)
  }

  return null
}

function edgeForEditorSplitDirection(direction: EditorPaneSplitDirection): DropEdge {
  return direction === 'horizontal' ? 'right' : 'bottom'
}

function splitDestination(
  windowId: WindowId,
  zone: Exclude<EditorPaneDropZone, 'center'>,
  scope: EditorPaneSplitScope | undefined,
): DropDestination {
  if (scope === 'root') return { edge: zone, kind: 'root-edge' }

  return { edge: zone, kind: 'window-edge', windowId }
}

function updateUiForClosedPath(
  path: string,
  selectedFilePath: string | null,
  remainingPathCount: number,
  uiStore: EditorUiStoreApi,
) {
  if (remainingPathCount === 0) {
    uiStore.getState().clearDefinitionTargetForPath(path)
  }
  if (path === selectedFilePath) return

  uiStore.getState().clearStatusBarSource()
}

function updateFallbackForClosedPath(
  path: string,
  selectedFilePath: string | null,
  documentStore: EditorDocumentStoreApi,
) {
  const document = documentStore.getState()
  if (document.fallbackDocumentPath !== path) return

  document.setFallbackDocumentPath(
    fallbackDocumentPathForSelection(document.hasLiveEditorDocument, selectedFilePath, null),
  )
}
