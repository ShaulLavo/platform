import type { PickedFsEntry } from "@/lib/file-system-types"
import type { EditorDiffViewMode } from "@/features/editor/utils/diff-view-mode"
import type {
  CachedWorkspaceState,
  WorkspacePanelTab,
} from "@/lib/workspace-cache"
import { readWorkspaceCache } from "@/lib/workspace-cache"
import { createContext, useContext } from "react"
import { useStore } from "zustand"
import { createStore, type StoreApi } from "zustand/vanilla"

type EditorWorkspaceStoreState = CachedWorkspaceState & {
  pickerOpen: boolean
}

type EditorWorkspaceStoreActions = {
  openPicker: () => void
  resetForRootFolder: (rootFolder: PickedFsEntry) => void
  setDiffViewMode: (mode: EditorDiffViewMode) => void
  setEditorHistory: (paths: string[]) => void
  setGitPanelOpen: (open: boolean) => void
  setOpenFilePaths: (paths: string[]) => void
  setPickerOpen: (open: boolean) => void
  setRecentlyClosedEditorPaths: (paths: string[]) => void
  setSelectedFilePath: (path: string | null) => void
  setSidebarVisible: (visible: boolean) => void
  setWorkspacePanelTab: (tab: WorkspacePanelTab) => void
}

export type EditorWorkspaceStore = EditorWorkspaceStoreState &
  EditorWorkspaceStoreActions

export type EditorWorkspaceStoreApi = StoreApi<EditorWorkspaceStore>

export const EditorWorkspaceStateContext =
  createContext<EditorWorkspaceStoreApi | null>(null)

export function useEditorWorkspaceStoreApi() {
  const store = useContext(EditorWorkspaceStateContext)
  if (!store) {
    throw new Error(
      "useEditorWorkspaceStoreApi must be used within EditorStateProvider"
    )
  }

  return store
}

export function useEditorWorkspaceState<T>(
  selector: (state: EditorWorkspaceStore) => T
): T {
  return useStore(useEditorWorkspaceStoreApi(), selector)
}

export function createEditorWorkspaceStore(
  initialState: CachedWorkspaceState = readWorkspaceCache()
) {
  return createStore<EditorWorkspaceStore>()((set) => ({
    diffViewMode: initialState.diffViewMode,
    editorHistory: initialState.editorHistory,
    gitPanelOpen: initialState.gitPanelOpen,
    openFilePaths: initialState.openFilePaths,
    pickerOpen: false,
    recentlyClosedEditorPaths: initialState.recentlyClosedEditorPaths,
    rootFolder: initialState.rootFolder,
    selectedFilePath: initialState.selectedFilePath,
    sidebarVisible: initialState.sidebarVisible,
    workspacePanelTab: initialState.workspacePanelTab,
    openPicker: () => set({ pickerOpen: true }),
    resetForRootFolder: (rootFolder) =>
      set((state) => ({
        diffViewMode: state.diffViewMode,
        editorHistory: [],
        gitPanelOpen: true,
        openFilePaths: [],
        pickerOpen: false,
        recentlyClosedEditorPaths: [],
        rootFolder,
        selectedFilePath: null,
        sidebarVisible: true,
        workspacePanelTab: "files",
      })),
    setDiffViewMode: (diffViewMode) => set({ diffViewMode }),
    setEditorHistory: (editorHistory) => set({ editorHistory }),
    setGitPanelOpen: (gitPanelOpen) => set({ gitPanelOpen }),
    setOpenFilePaths: (openFilePaths) => set({ openFilePaths }),
    setPickerOpen: (pickerOpen) => set({ pickerOpen }),
    setRecentlyClosedEditorPaths: (recentlyClosedEditorPaths) =>
      set({ recentlyClosedEditorPaths }),
    setSelectedFilePath: (selectedFilePath) => set({ selectedFilePath }),
    setSidebarVisible: (sidebarVisible) => set({ sidebarVisible }),
    setWorkspacePanelTab: (workspacePanelTab) => set({ workspacePanelTab }),
  }))
}
