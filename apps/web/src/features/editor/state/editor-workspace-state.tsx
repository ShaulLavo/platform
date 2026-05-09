import type { PickedFsEntry } from "@/components/file-picker-dialog"
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
  setOpenFilePaths: (paths: string[]) => void
  setPickerOpen: (open: boolean) => void
  setSelectedFilePath: (path: string | null) => void
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
    openFilePaths: initialState.openFilePaths,
    pickerOpen: false,
    rootFolder: initialState.rootFolder,
    selectedFilePath: initialState.selectedFilePath,
    workspacePanelTab: initialState.workspacePanelTab,
    openPicker: () => set({ pickerOpen: true }),
    resetForRootFolder: (rootFolder) =>
      set((state) => ({
        diffViewMode: state.diffViewMode,
        openFilePaths: [],
        pickerOpen: false,
        rootFolder,
        selectedFilePath: null,
        workspacePanelTab: "files",
      })),
    setDiffViewMode: (diffViewMode) => set({ diffViewMode }),
    setOpenFilePaths: (openFilePaths) => set({ openFilePaths }),
    setPickerOpen: (pickerOpen) => set({ pickerOpen }),
    setSelectedFilePath: (selectedFilePath) => set({ selectedFilePath }),
    setWorkspacePanelTab: (workspacePanelTab) => set({ workspacePanelTab }),
  }))
}
