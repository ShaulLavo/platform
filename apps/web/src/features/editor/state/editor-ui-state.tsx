import type { EditorStatusBarState } from "@/features/editor/components/editor-status-bar"
import type { TypeScriptLspDefinitionTarget } from "@editor/typescript-lsp"
import { createContext, useContext } from "react"
import { useStore } from "zustand"
import { createStore, type StoreApi } from "zustand/vanilla"

type EditorUiStoreState = {
  definitionTarget: TypeScriptLspDefinitionTarget | null
  statusBarState: EditorStatusBarState | null
}

type EditorUiStoreActions = {
  clearDefinitionTargetForPath: (path: string) => void
  renameDefinitionTargetPath: (from: string, to: string) => void
  resetEditorUiState: () => void
  setDefinitionTarget: (target: TypeScriptLspDefinitionTarget | null) => void
  setStatusBarState: (status: EditorStatusBarState | null) => void
}

export type EditorUiStore = EditorUiStoreState & EditorUiStoreActions

export type EditorUiStoreApi = StoreApi<EditorUiStore>

export const EditorUiStateContext = createContext<EditorUiStoreApi | null>(null)

export function useEditorUiStoreApi() {
  const store = useContext(EditorUiStateContext)
  if (!store) {
    throw new Error(
      "useEditorUiStoreApi must be used within EditorStateProvider"
    )
  }

  return store
}

export function useEditorUiState<T>(
  selector: (state: EditorUiStore) => T
): T {
  return useStore(useEditorUiStoreApi(), selector)
}

export function createEditorUiStore() {
  return createStore<EditorUiStore>()((set) => ({
    definitionTarget: null,
    statusBarState: null,
    clearDefinitionTargetForPath: (path) =>
      set((state) => {
        if (state.definitionTarget?.path !== path) return state

        return { definitionTarget: null }
      }),
    renameDefinitionTargetPath: (from, to) =>
      set((state) => {
        if (state.definitionTarget?.path !== from) return state

        return { definitionTarget: { ...state.definitionTarget, path: to } }
      }),
    resetEditorUiState: () =>
      set({
        definitionTarget: null,
        statusBarState: null,
      }),
    setDefinitionTarget: (definitionTarget) => set({ definitionTarget }),
    setStatusBarState: (statusBarState) =>
      set((state) => {
        if (statusBarState === state.statusBarState) return state

        return { statusBarState }
      }),
  }))
}
