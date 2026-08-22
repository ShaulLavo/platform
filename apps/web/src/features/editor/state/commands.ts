import { fallbackDocumentPathForSelection } from '@/features/editor/state/fallback-path'
import type {
  EditorSnapZone,
  EditorSplitDirection,
  EditorSplitScope,
} from '@/features/workspace/utils/tab-model'
import {
  EditorDocumentStateContext,
  useEditorDocumentStoreApi,
  type EditorDocumentStoreApi,
} from '@/features/editor/state/document-state'
import {
  editorHistoryForClosedPath,
  editorHistoryForRenamedPath,
  editorHistoryForSelection,
  previousOpenEditorPath,
  recentlyClosedEditorPathsForClose,
  recentlyClosedEditorPathsForReopen,
} from '@/features/editor/state/tab-paths'
import {
  EditorUiStateContext,
  useEditorUiStoreApi,
  type EditorUiStoreApi,
} from '@/features/editor/state/ui-state'
import {
  retentionForProjects,
  type RetainedWorkspaceSlice,
} from '@/features/editor/utils/document-retention'
import {
  EditorWorkspaceStateContext,
  editorWorkspaceSelectionForWorkbenchPanels,
  useEditorWorkspaceStoreApi,
  type EditorWorkspaceStore,
  type EditorWorkspaceStoreApi,
} from '@/features/editor/state/workspace-state'
import {
  closeEditorPathInWorkbenchPanels,
  closeEditorTabInWorkbenchPanels,
  editorOpenPathsForWorkbenchPanels,
  editorPathCountsForWorkbenchPanels,
  openEditorPathInWorkbenchPanels,
  renameEditorPathInWorkbenchPanels,
  reorderEditorTabInWorkbenchPanels,
  selectEditorTabInWorkbenchPanels,
  type WorkbenchPanels,
} from '@/features/workbench/utils/panels'
import { searchBufferDocumentId } from '@/features/search/utils/buffer-document'
import {
  SearchBufferStateContext,
  useSearchBufferStoreApi,
  type SearchBufferStoreApi,
} from '@/features/search/state/buffer-state'
import { log } from '@/lib/client-logging'
import type { PickedFsEntry } from '@/lib/file-system-types'
import type { LanguageServerDefinitionTarget } from '@singapor/lsp-plugin'
import { use, useMemo } from 'react'
import { settingsDocumentId } from '@/features/settings/utils/document'
import { editorTabDocumentIds } from '@/features/workspace/utils/tab-dirty'

export type EditorCommands = {
  closeTab: (tabId: string) => void
  discardAndCloseTab: (tabId: string) => { wasDirty: boolean }
  discardLiveEditorDocument: (path: string) => { wasDirty: boolean }
  moveTabToPane: (tabId: string, paneId: string, targetIndex?: number) => boolean
  moveTabToSplit: (
    tabId: string,
    paneId: string,
    zone: Exclude<EditorSnapZone, 'center'>,
    scope?: EditorSplitScope,
  ) => boolean
  openDefinition: (target: LanguageServerDefinitionTarget) => boolean
  openFileSurface: (path: string) => void
  openSearchEditor: (rootPath: string) => void
  openSettingsEditor: () => void
  reopenClosedEditor: () => boolean
  renameLiveEditorDocument: (from: string, to: string) => { wasDirty: boolean }
  reorderTab: (paneId: string, tabId: string, targetIndex: number) => boolean
  selectFile: (path: string | null) => void
  selectPreviousEditor: () => boolean
  selectTab: (paneId: string, tabId: string) => void
  setActivePane: (paneId: string) => void
  splitTab: (tabId: string, direction: EditorSplitDirection) => boolean
  /** Parks the open project and restores the target's tabs, history and search results. */
  switchRootFolder: (rootFolder: PickedFsEntry) => void
}

/**
 * The editor's commands where they exist, and null where they do not.
 *
 * Same reason `useOptionalEditorDocumentState` exists: a diff renders in the git panel, in a
 * checkpoint and in a test, and it wants `openDefinition` only for the case where following a
 * definition leaves the diff entirely. Throwing at it for being mounted outside the editor's
 * providers would turn an occasional capability into a hard dependency on the whole store stack.
 */
export function useOptionalEditorCommands(): EditorCommands | null {
  const documentStore = use(EditorDocumentStateContext)
  const searchStore = use(SearchBufferStateContext)
  const uiStore = use(EditorUiStateContext)
  const workspaceStore = use(EditorWorkspaceStateContext)

  return useMemo(() => {
    if (!documentStore || !searchStore || !uiStore || !workspaceStore) return null

    return createEditorCommands({ documentStore, searchStore, uiStore, workspaceStore })
  }, [documentStore, searchStore, uiStore, workspaceStore])
}

export function useEditorCommands() {
  const documentStore = useEditorDocumentStoreApi()
  const searchStore = useSearchBufferStoreApi()
  const uiStore = useEditorUiStoreApi()
  const workspaceStore = useEditorWorkspaceStoreApi()

  return useMemo(
    () => createEditorCommands({ documentStore, searchStore, uiStore, workspaceStore }),
    [documentStore, searchStore, uiStore, workspaceStore],
  )
}

export function createEditorCommands({
  documentStore,
  searchStore,
  uiStore,
  workspaceStore,
}: {
  documentStore: EditorDocumentStoreApi
  searchStore: SearchBufferStoreApi
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
    moveTabToPane: () => false,
    moveTabToSplit: () => false,
    openDefinition: (target) => openDefinition(target, workspaceStore, documentStore, uiStore),
    openFileSurface: (path) => openEditorPathSurface(path, workspaceStore, documentStore),
    openSearchEditor: (rootPath) =>
      openEditorPathSurface(searchBufferDocumentId(rootPath), workspaceStore, documentStore),
    // Dedupes by path like every other editor surface, so the settings tab is a
    // singleton without any bookkeeping of its own.
    openSettingsEditor: () =>
      openEditorPathSurface(settingsDocumentId(), workspaceStore, documentStore),
    reopenClosedEditor: () => reopenClosedEditor(workspaceStore, documentStore),
    renameLiveEditorDocument: (from, to) =>
      renameLiveEditorDocument(from, to, workspaceStore, documentStore, uiStore),
    reorderTab: (_paneId, tabId, targetIndex) => reorderTab(tabId, targetIndex, workspaceStore),
    selectFile: (path) => selectFile(path, workspaceStore, documentStore),
    selectPreviousEditor: () => selectPreviousEditor(workspaceStore, documentStore),
    selectTab: (_paneId, tabId) => selectTab(tabId, workspaceStore, documentStore),
    setActivePane: () => undefined,
    splitTab: () => false,
    switchRootFolder: (rootFolder) =>
      switchRootFolder(rootFolder, { documentStore, searchStore, uiStore, workspaceStore }),
  }
}

function selectFile(
  selectedFilePath: string | null,
  workspaceStore: EditorWorkspaceStoreApi,
  documentStore: EditorDocumentStoreApi,
) {
  if (!selectedFilePath) return

  openEditorPathSurface(selectedFilePath, workspaceStore, documentStore)
}

/**
 * Opens a path as an editor tab, deduping by path.
 *
 * Exported because it needs only these two stores, and a caller that renders both
 * inside and outside `EditorStateProvider` cannot go through `useEditorCommands`
 * — that hook reads four stores through accessors that throw. See
 * `useOpenSettingsJson`.
 */
export function openEditorPathSurface(
  selectedFilePath: string,
  workspaceStore: EditorWorkspaceStoreApi,
  documentStore: EditorDocumentStoreApi,
) {
  const workspace = workspaceStore.getState()
  const document = documentStore.getState()
  const workbenchPanels = openEditorPathInWorkbenchPanels(
    workspace.workbenchPanels,
    selectedFilePath,
  )
  const nextSelection = editorWorkspaceSelectionForWorkbenchPanelsForState(
    workspace,
    workbenchPanels,
  )

  logSelectFileTransition({
    nextSelection,
    requestedPath: selectedFilePath,
    workbenchPanels,
    workspace,
  })

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

function logSelectFileTransition({
  nextSelection,
  requestedPath,
  workbenchPanels,
  workspace,
}: {
  nextSelection: ReturnType<typeof editorWorkspaceSelectionForWorkbenchPanelsForState>
  requestedPath: string
  workbenchPanels: WorkbenchPanels
  workspace: EditorWorkspaceStore
}) {
  const existingTab = editorTabForPath(workspace.workbenchPanels, requestedPath)
  const requestedTab = editorTabForPath(workbenchPanels, requestedPath)

  log.info({
    action: 'editor.command.select_file',
    area: 'editor',
    existingTabId: existingTab?.id ?? null,
    nextActiveTabId: workbenchPanels.activeEditorTabId,
    nextOpenFilePaths: nextSelection.openFilePaths,
    nextSelectedFilePath: nextSelection.selectedFilePath,
    previousActiveTabId: workspace.workbenchPanels.activeEditorTabId,
    previousOpenFilePaths: workspace.openFilePaths,
    previousSelectedFilePath: workspace.selectedFilePath,
    requestedPath,
    requestedTabActive: requestedTab?.id === workbenchPanels.activeEditorTabId,
    requestedTabId: requestedTab?.id ?? null,
  })
}

function openDefinition(
  definitionTarget: LanguageServerDefinitionTarget,
  workspaceStore: EditorWorkspaceStoreApi,
  documentStore: EditorDocumentStoreApi,
  uiStore: EditorUiStoreApi,
) {
  openEditorPathSurface(definitionTarget.path, workspaceStore, documentStore)
  uiStore.setState({
    definitionTarget,
    statusBarSource: null,
  })

  return true
}

/**
 * A project switch used to be a wipe: every tab closed, every live document dropped,
 * search results gone. Now the outgoing project is parked whole and the incoming one
 * is restored, and only documents outside the retention ceiling are evicted — so
 * switching back is instant and unsaved edits survive the round trip.
 */
function switchRootFolder(
  rootFolder: PickedFsEntry,
  {
    documentStore,
    searchStore,
    uiStore,
    workspaceStore,
  }: {
    documentStore: EditorDocumentStoreApi
    searchStore: SearchBufferStoreApi
    uiStore: EditorUiStoreApi
    workspaceStore: EditorWorkspaceStoreApi
  },
) {
  const previousRootPath = workspaceStore.getState().rootFolder?.path ?? null
  if (previousRootPath === rootFolder.path) return

  uiStore.getState().resetEditorUiState()
  workspaceStore.getState().switchWorkspace(rootFolder)
  searchStore.getState().switchWorkspace(rootFolder.path)
  documentStore.getState().retainEditorDocuments(retentionForWorkspaces(workspaceStore.getState()))

  log.info({
    action: 'workspace.root_switched',
    area: 'workspace',
    parkedCount: workspaceStore.getState().parkedWorkspaces.size,
    path: rootFolder.path,
    previousPath: previousRootPath,
    restoredTabCount: workspaceStore.getState().workbenchPanels.editorTabs.length,
  })
}

function retentionForWorkspaces(workspace: EditorWorkspaceStore) {
  const activeRootPath = workspace.rootFolder?.path ?? null
  const parked = Array.from(workspace.parkedWorkspaces, ([rootPath, entry]) =>
    retainedSlice(rootPath, entry.workbenchPanels, entry.lastActiveAt),
  )

  return retentionForProjects({
    activeRootPath,
    slices: activeRootPath
      ? [...parked, retainedSlice(activeRootPath, workspace.workbenchPanels, Date.now())]
      : parked,
  })
}

function retainedSlice(
  rootPath: string,
  panels: WorkbenchPanels,
  lastActiveAt: number,
): RetainedWorkspaceSlice {
  return {
    documentIds: editorOpenPathsForWorkbenchPanels(panels),
    lastActiveAt,
    rootPath,
    tabIds: panels.editorTabs.map((tab) => tab.id),
  }
}

function retentionForPanels(panels: WorkbenchPanels) {
  return {
    documentIds: new Set(editorOpenPathsForWorkbenchPanels(panels)),
    tabIds: new Set(panels.editorTabs.map((tab) => tab.id)),
  }
}

function closeTab(
  tabId: string,
  workspaceStore: EditorWorkspaceStoreApi,
  documentStore: EditorDocumentStoreApi,
  uiStore: EditorUiStoreApi,
  options: { discard?: boolean } = {},
) {
  const workspace = workspaceStore.getState()
  const tab = editorTabForId(workspace.workbenchPanels, tabId)
  if (!tab) return { wasDirty: false }

  const path = tab.path
  const nextPanels = closeEditorTabInWorkbenchPanels(workspace.workbenchPanels, tabId)
  const nextSelection = editorWorkspaceSelectionForWorkbenchPanelsForState(workspace, nextPanels)
  const remainingCount = editorPathCountsForWorkbenchPanels(nextPanels).get(path) ?? 0
  // Every document behind the tab: discarding the settings tab has to drop both
  // scope buffers, and deleting its own path drops nothing at all — which left
  // the edits and the beforeunload warning behind after the user chose Discard.
  const result =
    options.discard && remainingCount === 0
      ? editorTabDocumentIds(path)
          .map((id) => documentStore.getState().deleteLiveEditorDocument(id))
          .reduce((all, one) => ({ wasDirty: all.wasDirty || one.wasDirty }), { wasDirty: false })
      : { wasDirty: false }

  if (!options.discard || remainingCount > 0) {
    documentStore.getState().removeEditorView(tabId)
    if (remainingCount === 0) {
      // One eviction policy in the codebase: keep everything the remaining tabs
      // still reference, and let retain() decide what that leaves behind.
      documentStore.getState().retainEditorDocuments(retentionForPanels(nextPanels))
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
  const nextPanels = closeEditorPathInWorkbenchPanels(workspace.workbenchPanels, path)
  const nextSelection = editorWorkspaceSelectionForWorkbenchPanelsForState(workspace, nextPanels)
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
  const workbenchPanels = renameEditorPathInWorkbenchPanels(workspace.workbenchPanels, from, to)
  workspaceStore.setState({
    ...editorWorkspaceSelectionForWorkbenchPanelsForState(workspace, workbenchPanels),
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

function reorderTab(tabId: string, targetIndex: number, workspaceStore: EditorWorkspaceStoreApi) {
  const workspace = workspaceStore.getState()
  const workbenchPanels = reorderEditorTabInWorkbenchPanels(
    workspace.workbenchPanels,
    tabId,
    targetIndex,
  )
  if (workbenchPanels === workspace.workbenchPanels) return false

  workspaceStore.setState(
    editorWorkspaceSelectionForWorkbenchPanelsForState(workspace, workbenchPanels),
  )
  return true
}

function selectTab(
  tabId: string,
  workspaceStore: EditorWorkspaceStoreApi,
  documentStore: EditorDocumentStoreApi,
) {
  const workspace = workspaceStore.getState()
  const workbenchPanels = selectEditorTabInWorkbenchPanels(workspace.workbenchPanels, tabId)
  if (workbenchPanels === workspace.workbenchPanels) return

  const nextSelection = editorWorkspaceSelectionForWorkbenchPanelsForState(
    workspace,
    workbenchPanels,
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

function editorWorkspaceSelectionForWorkbenchPanelsForState(
  workspace: EditorWorkspaceStore,
  workbenchPanels: WorkbenchPanels,
) {
  return editorWorkspaceSelectionForWorkbenchPanels(workbenchPanels, {
    currentOpenFilePaths: workspace.openFilePaths,
  })
}

function editorTabForId(panels: WorkbenchPanels, tabId: string) {
  return panels.editorTabs.find((tab) => tab.id === tabId) ?? null
}

function editorTabForPath(panels: WorkbenchPanels, path: string) {
  return panels.editorTabs.find((tab) => tab.path === path) ?? null
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
