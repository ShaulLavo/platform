import { fallbackDocumentPathForSelection } from '@/features/editor/state/editor-fallback-path'
import {
  activeEditorPanePath,
  closeEditorPaneTabs,
  editorPanePathCounts,
  findEditorPaneTab,
  moveEditorPaneTabToPane,
  moveEditorPaneTabToSplit,
  openEditorPathInActivePane,
  removeEditorPanePath,
  renameEditorPanePath,
  reorderEditorPaneTab,
  selectEditorPaneTab,
  setActiveEditorPane,
  splitEditorPaneTab,
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
  editorWorkspaceSelectionForPaneLayout,
  useEditorWorkspaceStoreApi,
  type EditorWorkspaceStoreApi,
} from '@/features/editor/state/editor-workspace-state'
import type { PickedFsEntry } from '@/lib/file-system-types'
import type { LanguageServerDefinitionTarget } from '@editor/language-server'
import { useMemo } from 'react'

export type EditorCommands = {
  closeTab: (tabId: string) => void
  discardAndCloseTab: (tabId: string) => { wasDirty: boolean }
  discardCachedEditorDocument: (path: string) => { wasDirty: boolean }
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
  renameCachedEditorDocument: (from: string, to: string) => { wasDirty: boolean }
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
    discardCachedEditorDocument: (path) =>
      discardCachedEditorDocument(path, workspaceStore, documentStore, uiStore),
    moveTabToPane: (tabId, paneId, targetIndex) =>
      moveTabToPane(tabId, paneId, targetIndex, workspaceStore),
    moveTabToSplit: (tabId, paneId, zone, scope) =>
      moveTabToSplit(tabId, paneId, zone, scope, workspaceStore),
    openDefinition: (target) => openDefinition(target, workspaceStore, documentStore, uiStore),
    pickRootFolder: (rootFolder) =>
      pickRootFolder(rootFolder, workspaceStore, documentStore, uiStore),
    reopenClosedEditor: () => reopenClosedEditor(workspaceStore, documentStore),
    renameCachedEditorDocument: (from, to) =>
      renameCachedEditorDocument(from, to, workspaceStore, documentStore, uiStore),
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
  documentStore.setState({
    fallbackDocumentPath: fallbackDocumentPathForSelection(
      document.hasCachedEditorDocument,
      workspace.selectedFilePath,
      document.fallbackDocumentPath,
    ),
  })

  const editorPaneLayout = openEditorPathInActivePane(workspace.editorPaneLayout, selectedFilePath)
  workspaceStore.setState({
    ...editorWorkspaceSelectionForPaneLayout(editorPaneLayout),
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
  documentStore.getState().clearCachedEditorDocuments()
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
  const location = findEditorPaneTab(workspace.editorPaneLayout.root, tabId)
  if (!location) return { wasDirty: false }

  const path = location.tab.path
  const nextLayout = closeEditorPaneTabs(workspace.editorPaneLayout, [tabId])
  const remainingCount = editorPanePathCounts(nextLayout).get(path) ?? 0
  const result =
    options.discard && remainingCount === 0
      ? documentStore.getState().deleteCachedEditorDocument(path, {
          bumpVersion: true,
        })
      : { wasDirty: false }

  if (!options.discard) {
    documentStore.getState().evictCleanCachedEditorTabDocument(tabId)
    if (remainingCount === 0) {
      documentStore.getState().evictCleanCachedEditorDocument(path)
    }
  }

  const selectedFilePath = activeEditorPanePath(nextLayout)
  updateUiForClosedPath(path, selectedFilePath, remainingCount, uiStore)
  updateFallbackForClosedPath(path, selectedFilePath, documentStore)
  workspaceStore.setState({
    ...editorWorkspaceSelectionForPaneLayout(nextLayout),
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

function discardCachedEditorDocument(
  path: string,
  workspaceStore: EditorWorkspaceStoreApi,
  documentStore: EditorDocumentStoreApi,
  uiStore: EditorUiStoreApi,
) {
  const workspace = workspaceStore.getState()
  const result = documentStore.getState().deleteCachedEditorDocument(path, {
    bumpVersion: workspace.openFilePaths.includes(path),
  })
  const nextLayout = removeEditorPanePath(workspace.editorPaneLayout, path)
  const selectedFilePath = activeEditorPanePath(nextLayout)

  updateUiForClosedPath(path, selectedFilePath, 0, uiStore)
  updateFallbackForClosedPath(path, selectedFilePath, documentStore)
  workspaceStore.setState({
    ...editorWorkspaceSelectionForPaneLayout(nextLayout),
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

function renameCachedEditorDocument(
  from: string,
  to: string,
  workspaceStore: EditorWorkspaceStoreApi,
  documentStore: EditorDocumentStoreApi,
  uiStore: EditorUiStoreApi,
) {
  const workspace = workspaceStore.getState()
  const result = documentStore.getState().renameCachedEditorDocumentPath(from, to, {
    bumpVersion: workspace.openFilePaths.includes(from),
  })
  const editorPaneLayout = renameEditorPanePath(workspace.editorPaneLayout, from, to)
  workspaceStore.setState({
    ...editorWorkspaceSelectionForPaneLayout(editorPaneLayout),
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
  paneId: string,
  tabId: string,
  targetIndex: number,
  workspaceStore: EditorWorkspaceStoreApi,
) {
  const workspace = workspaceStore.getState()
  const editorPaneLayout = reorderEditorPaneTab(
    workspace.editorPaneLayout,
    paneId,
    tabId,
    targetIndex,
  )
  if (editorPaneLayout === workspace.editorPaneLayout) return false

  workspaceStore.setState(editorWorkspaceSelectionForPaneLayout(editorPaneLayout))
  return true
}

function selectTab(
  paneId: string,
  tabId: string,
  workspaceStore: EditorWorkspaceStoreApi,
  documentStore: EditorDocumentStoreApi,
) {
  const workspace = workspaceStore.getState()
  const editorPaneLayout = selectEditorPaneTab(workspace.editorPaneLayout, paneId, tabId)
  const selectedFilePath = activeEditorPanePath(editorPaneLayout)
  const document = documentStore.getState()

  documentStore.setState({
    fallbackDocumentPath: fallbackDocumentPathForSelection(
      document.hasCachedEditorDocument,
      workspace.selectedFilePath,
      document.fallbackDocumentPath,
    ),
  })
  workspaceStore.setState({
    ...editorWorkspaceSelectionForPaneLayout(editorPaneLayout),
    editorHistory: editorHistoryForSelection(workspace.editorHistory, selectedFilePath),
  })
}

function setActivePane(paneId: string, workspaceStore: EditorWorkspaceStoreApi) {
  const workspace = workspaceStore.getState()
  const editorPaneLayout = setActiveEditorPane(workspace.editorPaneLayout, paneId)
  if (editorPaneLayout === workspace.editorPaneLayout) return

  workspaceStore.setState(editorWorkspaceSelectionForPaneLayout(editorPaneLayout))
}

function splitTab(
  tabId: string,
  direction: EditorPaneSplitDirection,
  workspaceStore: EditorWorkspaceStoreApi,
) {
  const workspace = workspaceStore.getState()
  const editorPaneLayout = splitEditorPaneTab(workspace.editorPaneLayout, tabId, direction)
  if (editorPaneLayout === workspace.editorPaneLayout) return false

  workspaceStore.setState(editorWorkspaceSelectionForPaneLayout(editorPaneLayout))
  return true
}

function moveTabToPane(
  tabId: string,
  paneId: string,
  targetIndex: number | undefined,
  workspaceStore: EditorWorkspaceStoreApi,
) {
  const workspace = workspaceStore.getState()
  const editorPaneLayout = moveEditorPaneTabToPane(
    workspace.editorPaneLayout,
    tabId,
    paneId,
    targetIndex,
  )
  if (editorPaneLayout === workspace.editorPaneLayout) return false

  workspaceStore.setState(editorWorkspaceSelectionForPaneLayout(editorPaneLayout))
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
  const editorPaneLayout = moveEditorPaneTabToSplit(workspace.editorPaneLayout, {
    sourceTabId: tabId,
    targetPaneId: paneId,
    scope,
    zone,
  })
  if (editorPaneLayout === workspace.editorPaneLayout) return false

  workspaceStore.setState(editorWorkspaceSelectionForPaneLayout(editorPaneLayout))
  return true
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
    fallbackDocumentPathForSelection(document.hasCachedEditorDocument, selectedFilePath, null),
  )
}
