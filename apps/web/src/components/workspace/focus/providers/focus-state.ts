import type { EditorCommandContext, EditorCommandId } from '@editor/core'
import { createContext, use } from 'react'
import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'
import { clientErrors } from '@/lib/structured-errors'

export type FocusArea = 'editor' | 'file-tree' | 'git' | 'global' | 'logs' | 'terminal' | null

type FocusStoreState = {
  activeArea: FocusArea
  activeEditorCommandDispatch: EditorCommandDispatch | null
  editorFocusRequestId: number
}

type FocusStoreActions = {
  clearFocusArea: (area?: FocusArea) => void
  consumeEditorFocusRequest: () => number
  dispatchEditorCommand: (command: EditorCommandId, context?: EditorCommandContext) => boolean
  requestEditorFocus: () => void
  setActiveEditorCommandDispatch: (dispatch: EditorCommandDispatch | null) => void
  setFocusArea: (area: FocusArea) => void
}

type FocusStore = FocusStoreState & FocusStoreActions

type FocusStoreApi = StoreApi<FocusStore>

type EditorCommandDispatch = (command: EditorCommandId, context?: EditorCommandContext) => boolean

const FocusContext = createContext<FocusStoreApi | null>(null)
export { FocusContext }

export function useFocus<T>(selector: (state: FocusStore) => T): T {
  const store = use(FocusContext)
  if (!store) {
    throw clientErrors.CONTEXT_MISSING({
      message: 'useFocus must be used within FocusProvider',
    })
  }

  return useStore(store, selector)
}

export function createFocusStore() {
  return createStore<FocusStore>()((set, get) => ({
    activeArea: null,
    activeEditorCommandDispatch: null,
    editorFocusRequestId: 0,
    clearFocusArea: (area) =>
      set((state) => {
        if (area !== undefined && state.activeArea !== area) return state
        if (!state.activeArea) return state

        return { activeArea: null }
      }),
    consumeEditorFocusRequest: () => get().editorFocusRequestId,
    dispatchEditorCommand: (command, context) =>
      get().activeEditorCommandDispatch?.(command, context) ?? false,
    requestEditorFocus: () =>
      set((state) => ({
        activeArea: 'editor',
        editorFocusRequestId: state.editorFocusRequestId + 1,
      })),
    setActiveEditorCommandDispatch: (activeEditorCommandDispatch) =>
      set({ activeEditorCommandDispatch }),
    setFocusArea: (activeArea) =>
      set((state) => {
        if (state.activeArea === activeArea) return state

        return { activeArea }
      }),
  }))
}
