import type { EditorCommandContext, EditorCommandId } from '@editor/core'
import { createContext, useContext } from 'react'
import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'
import { clientErrors } from '@/lib/structured-errors'

export type WorkspaceFocusArea = 'editor' | 'file-tree' | 'git' | 'global' | 'terminal' | null

type WorkspaceFocusStoreState = {
  activeArea: WorkspaceFocusArea
  activeEditorCommandDispatch: EditorCommandDispatch | null
  editorFocusRequestId: number
}

type WorkspaceFocusStoreActions = {
  clearFocusArea: (area?: WorkspaceFocusArea) => void
  consumeEditorFocusRequest: () => number
  dispatchEditorCommand: (command: EditorCommandId, context?: EditorCommandContext) => boolean
  requestEditorFocus: () => void
  setActiveEditorCommandDispatch: (dispatch: EditorCommandDispatch | null) => void
  setFocusArea: (area: WorkspaceFocusArea) => void
}

type WorkspaceFocusStore = WorkspaceFocusStoreState & WorkspaceFocusStoreActions

type WorkspaceFocusStoreApi = StoreApi<WorkspaceFocusStore>

type EditorCommandDispatch = (command: EditorCommandId, context?: EditorCommandContext) => boolean

const WorkspaceFocusContext = createContext<WorkspaceFocusStoreApi | null>(null)
export { WorkspaceFocusContext }

export function useWorkspaceFocus<T>(selector: (state: WorkspaceFocusStore) => T): T {
  const store = useContext(WorkspaceFocusContext)
  if (!store) {
    throw clientErrors.CONTEXT_MISSING({
      message: 'useWorkspaceFocus must be used within WorkspaceFocusProvider',
    })
  }

  return useStore(store, selector)
}

export function createWorkspaceFocusStore() {
  return createStore<WorkspaceFocusStore>()((set, get) => ({
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
