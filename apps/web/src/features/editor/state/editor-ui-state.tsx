import type { EditorStatusBarState } from '@/features/editor/components/editor-status-bar'
import type {
  LanguageServerDefinitionTarget,
  LanguageServerReferencesResult,
} from '@editor/language-server'
import { createContext, useContext } from 'react'
import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'

type EditorUiStoreState = {
  definitionTarget: LanguageServerDefinitionTarget | null
  languageServerReferences: LanguageServerReferencesResult | null
  statusBarState: EditorStatusBarState | null
}

type EditorUiStoreActions = {
  clearDefinitionTargetForPath: (path: string) => void
  renameDefinitionTargetPath: (from: string, to: string) => void
  renameLanguageServerReferencesPath: (from: string, to: string) => void
  resetEditorUiState: () => void
  setDefinitionTarget: (target: LanguageServerDefinitionTarget | null) => void
  setLanguageServerReferences: (references: LanguageServerReferencesResult | null) => void
  setStatusBarState: (status: EditorStatusBarState | null) => void
}

export type EditorUiStore = EditorUiStoreState & EditorUiStoreActions

export type EditorUiStoreApi = StoreApi<EditorUiStore>

export const EditorUiStateContext = createContext<EditorUiStoreApi | null>(null)

export function useEditorUiStoreApi() {
  const store = useContext(EditorUiStateContext)
  if (!store) {
    throw new Error('useEditorUiStoreApi must be used within EditorStateProvider')
  }

  return store
}

export function useEditorUiState<T>(selector: (state: EditorUiStore) => T): T {
  return useStore(useEditorUiStoreApi(), selector)
}

export function createEditorUiStore() {
  return createStore<EditorUiStore>()((set) => ({
    definitionTarget: null,
    languageServerReferences: null,
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
    renameLanguageServerReferencesPath: (from, to) =>
      set((state) => {
        const references = renamedLanguageServerReferences(state.languageServerReferences, from, to)
        if (references === state.languageServerReferences) return state

        return { languageServerReferences: references }
      }),
    resetEditorUiState: () =>
      set({
        definitionTarget: null,
        languageServerReferences: null,
        statusBarState: null,
      }),
    setDefinitionTarget: (definitionTarget) => set({ definitionTarget }),
    setLanguageServerReferences: (languageServerReferences) => set({ languageServerReferences }),
    setStatusBarState: (statusBarState) =>
      set((state) => {
        if (statusBarState === state.statusBarState) return state

        return { statusBarState }
      }),
  }))
}

function renamedLanguageServerReferences(
  references: LanguageServerReferencesResult | null,
  from: string,
  to: string,
) {
  if (!references) return references

  let changed = false
  const targets = references.targets.map((target) => {
    if (target.path !== from) return target

    changed = true
    return { ...target, path: to }
  })
  if (!changed) return references

  return { ...references, targets }
}
