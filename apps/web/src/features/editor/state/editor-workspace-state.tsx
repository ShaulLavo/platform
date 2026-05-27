import type { PickedFsEntry } from '@/lib/file-system-types'
import type { EditorDiffViewMode } from '@/features/editor/utils/diff-view-mode'
import {
  activeEditorPanePath,
  createEditorPaneLayoutForPaths,
  editorPaneOpenPaths,
  normalizeEditorPaneLayout,
  type EditorPaneLayout,
} from '@/features/editor/state/editor-pane-state'
import type { CachedWorkspaceState, WorkspacePanelTab } from '@/lib/workspace-cache'
import { readWorkspaceCache } from '@/lib/workspace-cache'
import { clientErrors } from '@/lib/structured-errors'
import { createContext, use } from 'react'
import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'

type EditorWorkspaceStoreState = CachedWorkspaceState & {
  pickerOpen: boolean
}

type EditorWorkspaceStoreActions = {
  activateWorkspacePanelTab: (tab: WorkspacePanelTab) => void
  openPicker: () => void
  resetForRootFolder: (rootFolder: PickedFsEntry) => void
  setDiffViewMode: (mode: EditorDiffViewMode) => void
  setEditorPaneLayout: (layout: EditorPaneLayout) => void
  setEditorHistory: (paths: string[]) => void
  setGitPanelOpen: (open: boolean) => void
  setOpenFilePaths: (paths: string[]) => void
  setPickerOpen: (open: boolean) => void
  setRecentlyClosedEditorPaths: (paths: string[]) => void
  setSelectedFilePath: (path: string | null) => void
  setSidebarVisible: (visible: boolean) => void
  setWorkspacePanelSelection: (selection: WorkspacePanelSelection) => void
  setWorkspacePanelTab: (tab: WorkspacePanelTab) => void
}

export type EditorWorkspaceStore = EditorWorkspaceStoreState & EditorWorkspaceStoreActions

export type EditorWorkspaceStoreApi = StoreApi<EditorWorkspaceStore>

export const EditorWorkspaceStateContext = createContext<EditorWorkspaceStoreApi | null>(null)

type WorkspacePanelSelection = Pick<
  EditorWorkspaceStoreState,
  'sidebarVisible' | 'workspacePanelTab'
>

export function useEditorWorkspaceStoreApi() {
  const store = use(EditorWorkspaceStateContext)
  if (!store) {
    throw clientErrors.CONTEXT_MISSING({
      message: 'useEditorWorkspaceStoreApi must be used within EditorStateProvider',
    })
  }

  return store
}

export function useEditorWorkspaceState<T>(selector: (state: EditorWorkspaceStore) => T): T {
  return useStore(useEditorWorkspaceStoreApi(), selector)
}

export function createEditorWorkspaceStore(
  initialState: CachedWorkspaceState = readWorkspaceCache(),
) {
  return createStore<EditorWorkspaceStore>()((set) => ({
    diffViewMode: initialState.diffViewMode,
    editorHistory: initialState.editorHistory,
    editorPaneLayout: initialState.editorPaneLayout,
    gitPanelOpen: initialState.gitPanelOpen,
    openFilePaths: initialState.openFilePaths,
    pickerOpen: false,
    recentlyClosedEditorPaths: initialState.recentlyClosedEditorPaths,
    rootFolder: initialState.rootFolder,
    selectedFilePath: initialState.selectedFilePath,
    sidebarVisible: initialState.sidebarVisible,
    workspacePanelTab: initialState.workspacePanelTab,
    activateWorkspacePanelTab: (workspacePanelTab) =>
      set((state) => workspacePanelSelectionForTabActivation(state, workspacePanelTab)),
    openPicker: () => set({ pickerOpen: true }),
    resetForRootFolder: (rootFolder) =>
      set((state) => ({
        diffViewMode: state.diffViewMode,
        editorHistory: [],
        editorPaneLayout: createEditorPaneLayoutForPaths([], null),
        gitPanelOpen: true,
        openFilePaths: [],
        pickerOpen: false,
        recentlyClosedEditorPaths: [],
        rootFolder,
        selectedFilePath: null,
        sidebarVisible: true,
        workspacePanelTab: 'files',
      })),
    setDiffViewMode: (diffViewMode) => set({ diffViewMode }),
    setEditorPaneLayout: (editorPaneLayout) =>
      set(editorWorkspaceSelectionForPaneLayout(editorPaneLayout)),
    setEditorHistory: (editorHistory) => set({ editorHistory }),
    setGitPanelOpen: (gitPanelOpen) => set({ gitPanelOpen }),
    setOpenFilePaths: (openFilePaths) =>
      set((state) =>
        editorWorkspaceSelectionForPaneLayout(
          createEditorPaneLayoutForPaths(
            pathsWithSelectedPath(openFilePaths, state.selectedFilePath),
            state.selectedFilePath,
          ),
        ),
      ),
    setPickerOpen: (pickerOpen) => set({ pickerOpen }),
    setRecentlyClosedEditorPaths: (recentlyClosedEditorPaths) => set({ recentlyClosedEditorPaths }),
    setSelectedFilePath: (selectedFilePath) =>
      set((state) =>
        editorWorkspaceSelectionForPaneLayout(
          createEditorPaneLayoutForPaths(
            pathsWithSelectedPath(state.openFilePaths, selectedFilePath),
            selectedFilePath,
          ),
        ),
      ),
    setSidebarVisible: (sidebarVisible) =>
      set((state) => {
        if (state.sidebarVisible === sidebarVisible) return state

        return { sidebarVisible }
      }),
    setWorkspacePanelSelection: (selection) =>
      set((state) => {
        if (
          state.sidebarVisible === selection.sidebarVisible &&
          state.workspacePanelTab === selection.workspacePanelTab
        )
          return state

        return selection
      }),
    setWorkspacePanelTab: (workspacePanelTab) =>
      set((state) => {
        if (state.workspacePanelTab === workspacePanelTab) return state

        return { workspacePanelTab }
      }),
  }))
}

function workspacePanelSelectionForTabActivation(
  current: WorkspacePanelSelection,
  workspacePanelTab: WorkspacePanelTab,
): WorkspacePanelSelection {
  if (current.sidebarVisible && current.workspacePanelTab === workspacePanelTab) {
    return { ...current, sidebarVisible: false }
  }

  return { sidebarVisible: true, workspacePanelTab }
}

function pathsWithSelectedPath(openFilePaths: readonly string[], selectedFilePath: string | null) {
  if (!selectedFilePath) return openFilePaths
  if (openFilePaths.includes(selectedFilePath)) return openFilePaths

  return openFilePaths.concat(selectedFilePath)
}

export function editorWorkspaceSelectionForPaneLayout(editorPaneLayout: EditorPaneLayout) {
  const normalized = normalizeEditorPaneLayout(editorPaneLayout)
  return {
    editorPaneLayout: normalized,
    openFilePaths: editorPaneOpenPaths(normalized),
    selectedFilePath: activeEditorPanePath(normalized),
  }
}
