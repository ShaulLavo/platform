import type { PickedFsEntry } from "@/components/file-picker-dialog"
import type { EditorStatusBarState } from "@/components/editor/editor-status-bar"
import {
  formatHistoryStatus,
  formatSyntaxStatus,
  formatTypeScriptLspStatus,
} from "@/components/editor/status-formatters"
import type { CachedWorkspaceState } from "@/lib/workspace-cache"
import { readWorkspaceCache } from "@/lib/workspace-cache"
import type { TypeScriptLspDefinitionTarget } from "@editor/typescript-lsp"
import { createContext, useContext } from "react"
import { useStore } from "zustand"
import { createStore, type StoreApi } from "zustand/vanilla"

type EditorStoreState = CachedWorkspaceState & {
  definitionTarget: TypeScriptLspDefinitionTarget | null
  editorStatus: EditorStatusBarState | null
  pickerOpen: boolean
}

type EditorStoreActions = {
  openDefinition: (target: TypeScriptLspDefinitionTarget) => boolean
  openPicker: () => void
  pickRootFolder: (rootFolder: PickedFsEntry) => void
  selectFile: (path: string | null) => void
  setEditorStatus: (status: EditorStatusBarState | null) => void
  setPickerOpen: (open: boolean) => void
}

type EditorStore = EditorStoreState & EditorStoreActions

type EditorStoreApi = StoreApi<EditorStore>

export const EditorStateContext = createContext<EditorStoreApi | null>(null)

export function useEditorState<T>(selector: (state: EditorStore) => T): T {
  const store = useContext(EditorStateContext)
  if (!store) {
    throw new Error("useEditorState must be used within EditorStateProvider")
  }

  return useStore(store, selector)
}

export function createEditorStore(
  initialState: CachedWorkspaceState = readWorkspaceCache()
) {
  return createStore<EditorStore>()((set) => ({
    definitionTarget: null,
    editorStatus: null,
    pickerOpen: false,
    rootFolder: initialState.rootFolder,
    selectedFilePath: initialState.selectedFilePath,
    openDefinition: (definitionTarget) => {
      set({
        definitionTarget,
        selectedFilePath: definitionTarget.path,
      })
      return true
    },
    openPicker: () => set({ pickerOpen: true }),
    pickRootFolder: (rootFolder) =>
      set({
        definitionTarget: null,
        editorStatus: null,
        pickerOpen: false,
        rootFolder,
        selectedFilePath: null,
      }),
    selectFile: (selectedFilePath) =>
      set({
        editorStatus: null,
        selectedFilePath,
      }),
    setEditorStatus: (status) =>
      set((state) => {
        const editorStatus = nextEditorStatus(state.editorStatus, status)
        if (editorStatus === state.editorStatus) return state

        return { editorStatus }
      }),
    setPickerOpen: (pickerOpen) => set({ pickerOpen }),
  }))
}

function nextEditorStatus(
  currentStatus: EditorStatusBarState | null,
  nextStatus: EditorStatusBarState | null
) {
  if (!nextStatus) return null
  if (sameEditorStatus(currentStatus, nextStatus)) return currentStatus

  return nextStatus
}

function sameEditorStatus(
  currentStatus: EditorStatusBarState | null,
  nextStatus: EditorStatusBarState
) {
  if (!currentStatus) return false

  return editorStatusKey(currentStatus) === editorStatusKey(nextStatus)
}

function editorStatusKey(status: EditorStatusBarState) {
  const cursor = status.state?.documentId
    ? `${status.state.cursor.row}:${status.state.cursor.column}`
    : ""
  const syntax = formatSyntaxStatus(status.state)
  const history = formatHistoryStatus(status.state)
  const typeScript = formatTypeScriptLspStatus(
    status.typeScriptStatus,
    status.typeScriptDiagnostics
  )

  return [
    status.filePath,
    status.charCount,
    cursor,
    syntax,
    history,
    typeScript,
  ].join("\u0000")
}
