import { createContext, useContext } from "react"
import { useStore } from "zustand"
import { createStore, type StoreApi } from "zustand/vanilla"

export type WorkspaceFocusArea =
  | "editor"
  | "file-tree"
  | "git"
  | "global"
  | null

type WorkspaceFocusStoreState = {
  activeArea: WorkspaceFocusArea
  editorFocusRequestId: number
}

type WorkspaceFocusStoreActions = {
  clearFocusArea: (area?: WorkspaceFocusArea) => void
  consumeEditorFocusRequest: () => number
  requestEditorFocus: () => void
  setFocusArea: (area: WorkspaceFocusArea) => void
}

type WorkspaceFocusStore = WorkspaceFocusStoreState & WorkspaceFocusStoreActions

type WorkspaceFocusStoreApi = StoreApi<WorkspaceFocusStore>

const WorkspaceFocusContext = createContext<WorkspaceFocusStoreApi | null>(null)
export { WorkspaceFocusContext }

export function useWorkspaceFocus<T>(
  selector: (state: WorkspaceFocusStore) => T
): T {
  const store = useContext(WorkspaceFocusContext)
  if (!store) {
    throw new Error(
      "useWorkspaceFocus must be used within WorkspaceFocusProvider"
    )
  }

  return useStore(store, selector)
}

export function createWorkspaceFocusStore() {
  return createStore<WorkspaceFocusStore>()((set, get) => ({
    activeArea: null,
    editorFocusRequestId: 0,
    clearFocusArea: (area) =>
      set((state) => {
        if (area !== undefined && state.activeArea !== area) return state
        if (!state.activeArea) return state

        return { activeArea: null }
      }),
    consumeEditorFocusRequest: () => get().editorFocusRequestId,
    requestEditorFocus: () =>
      set((state) => ({
        activeArea: "editor",
        editorFocusRequestId: state.editorFocusRequestId + 1,
      })),
    setFocusArea: (activeArea) =>
      set((state) => {
        if (state.activeArea === activeArea) return state

        return { activeArea }
      }),
  }))
}
