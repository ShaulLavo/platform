import { fallbackDocumentPathForSelection } from "@/features/editor/state/editor-fallback-path"
import {
  useEditorDocumentStoreApi,
  type EditorDocumentStoreApi,
} from "@/features/editor/state/editor-document-state"
import {
  nextSelectedFilePath,
  openFilePathList,
  renameOpenFilePath,
} from "@/features/editor/state/editor-tab-paths"
import {
  useEditorUiStoreApi,
  type EditorUiStoreApi,
} from "@/features/editor/state/editor-ui-state"
import {
  useEditorWorkspaceStoreApi,
  type EditorWorkspaceStoreApi,
} from "@/features/editor/state/editor-workspace-state"
import type { PickedFsEntry } from "@/components/file-picker-dialog"
import type { TypeScriptLspDefinitionTarget } from "@editor/typescript-lsp"
import { useMemo } from "react"

export type EditorCommands = {
  closeTab: (path: string) => void
  discardCachedEditorDocument: (path: string) => { wasDirty: boolean }
  openDefinition: (target: TypeScriptLspDefinitionTarget) => boolean
  pickRootFolder: (rootFolder: PickedFsEntry) => void
  renameCachedEditorDocument: (
    from: string,
    to: string
  ) => { wasDirty: boolean }
  selectFile: (path: string | null) => void
}

export function useEditorCommands() {
  const documentStore = useEditorDocumentStoreApi()
  const uiStore = useEditorUiStoreApi()
  const workspaceStore = useEditorWorkspaceStoreApi()

  return useMemo(
    () => createEditorCommands({ documentStore, uiStore, workspaceStore }),
    [documentStore, uiStore, workspaceStore]
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
    closeTab: (path) => closeTab(path, workspaceStore, documentStore, uiStore),
    discardCachedEditorDocument: (path) =>
      discardCachedEditorDocument(path, workspaceStore, documentStore, uiStore),
    openDefinition: (target) =>
      openDefinition(target, workspaceStore, documentStore, uiStore),
    pickRootFolder: (rootFolder) =>
      pickRootFolder(rootFolder, workspaceStore, documentStore, uiStore),
    renameCachedEditorDocument: (from, to) =>
      renameCachedEditorDocument(
        from,
        to,
        workspaceStore,
        documentStore,
        uiStore
      ),
    selectFile: (path) =>
      selectFile(path, workspaceStore, documentStore, uiStore),
  }
}

function selectFile(
  selectedFilePath: string | null,
  workspaceStore: EditorWorkspaceStoreApi,
  documentStore: EditorDocumentStoreApi,
  uiStore: EditorUiStoreApi
) {
  const workspace = workspaceStore.getState()
  const document = documentStore.getState()
  const fallbackDocumentPath = fallbackDocumentPathForSelection(
    document.hasCachedEditorDocument,
    workspace.selectedFilePath,
    document.fallbackDocumentPath
  )
  documentStore.setState({ fallbackDocumentPath })
  uiStore.getState().setStatusBarState(null)
  workspaceStore.setState({
    openFilePaths: selectedFilePath
      ? openFilePathList(workspace.openFilePaths, selectedFilePath)
      : workspace.openFilePaths,
    selectedFilePath,
  })
}

function openDefinition(
  definitionTarget: TypeScriptLspDefinitionTarget,
  workspaceStore: EditorWorkspaceStoreApi,
  documentStore: EditorDocumentStoreApi,
  uiStore: EditorUiStoreApi
) {
  const workspace = workspaceStore.getState()
  const document = documentStore.getState()
  documentStore.setState({
    fallbackDocumentPath: fallbackDocumentPathForSelection(
      document.hasCachedEditorDocument,
      workspace.selectedFilePath,
      document.fallbackDocumentPath
    ),
  })
  uiStore.setState({
    definitionTarget,
    statusBarState: null,
  })
  workspaceStore.setState({
    openFilePaths: openFilePathList(
      workspace.openFilePaths,
      definitionTarget.path
    ),
    selectedFilePath: definitionTarget.path,
  })

  return true
}

function pickRootFolder(
  rootFolder: PickedFsEntry,
  workspaceStore: EditorWorkspaceStoreApi,
  documentStore: EditorDocumentStoreApi,
  uiStore: EditorUiStoreApi
) {
  documentStore.getState().clearCachedEditorDocuments()
  uiStore.getState().resetEditorUiState()
  workspaceStore.getState().resetForRootFolder(rootFolder)
}

function closeTab(
  path: string,
  workspaceStore: EditorWorkspaceStoreApi,
  documentStore: EditorDocumentStoreApi,
  uiStore: EditorUiStoreApi
) {
  const workspace = workspaceStore.getState()
  if (!workspace.openFilePaths.includes(path)) return

  documentStore.getState().evictCleanCachedEditorDocument(path)
  const openFilePaths = workspace.openFilePaths.filter(
    (filePath) => filePath !== path
  )
  const selectedFilePath =
    workspace.selectedFilePath === path
      ? nextSelectedFilePath(workspace.openFilePaths, path)
      : workspace.selectedFilePath

  updateUiForClosedPath(path, selectedFilePath, workspace, uiStore)
  updateFallbackForClosedPath(path, selectedFilePath, documentStore)
  workspaceStore.setState({ openFilePaths, selectedFilePath })
}

function discardCachedEditorDocument(
  path: string,
  workspaceStore: EditorWorkspaceStoreApi,
  documentStore: EditorDocumentStoreApi,
  uiStore: EditorUiStoreApi
) {
  const workspace = workspaceStore.getState()
  const result = documentStore.getState().deleteCachedEditorDocument(path, {
    bumpVersion: workspace.openFilePaths.includes(path),
  })
  const openFilePaths = workspace.openFilePaths.filter(
    (filePath) => filePath !== path
  )
  const selectedFilePath =
    workspace.selectedFilePath === path
      ? nextSelectedFilePath(workspace.openFilePaths, path)
      : workspace.selectedFilePath

  updateUiForClosedPath(path, selectedFilePath, workspace, uiStore)
  updateFallbackForClosedPath(path, selectedFilePath, documentStore)
  workspaceStore.setState({ openFilePaths, selectedFilePath })

  return { wasDirty: result.wasDirty }
}

function renameCachedEditorDocument(
  from: string,
  to: string,
  workspaceStore: EditorWorkspaceStoreApi,
  documentStore: EditorDocumentStoreApi,
  uiStore: EditorUiStoreApi
) {
  const workspace = workspaceStore.getState()
  const result = documentStore
    .getState()
    .renameCachedEditorDocumentPath(from, to, {
      bumpVersion: workspace.openFilePaths.includes(from),
    })
  workspaceStore.setState({
    openFilePaths: renameOpenFilePath(workspace.openFilePaths, from, to),
    selectedFilePath:
      workspace.selectedFilePath === from ? to : workspace.selectedFilePath,
  })
  uiStore.getState().renameDefinitionTargetPath(from, to)

  return result
}

function updateUiForClosedPath(
  path: string,
  selectedFilePath: string | null,
  workspace: { selectedFilePath: string | null },
  uiStore: EditorUiStoreApi
) {
  uiStore.getState().clearDefinitionTargetForPath(path)
  if (workspace.selectedFilePath === selectedFilePath) return

  uiStore.getState().setStatusBarState(null)
}

function updateFallbackForClosedPath(
  path: string,
  selectedFilePath: string | null,
  documentStore: EditorDocumentStoreApi
) {
  const document = documentStore.getState()
  if (document.fallbackDocumentPath !== path) return

  document.setFallbackDocumentPath(
    fallbackDocumentPathForSelection(
      document.hasCachedEditorDocument,
      selectedFilePath,
      null
    )
  )
}
