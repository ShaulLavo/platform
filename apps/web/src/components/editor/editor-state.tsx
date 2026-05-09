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
  closeTab: (path: string) => void
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
    openFilePaths: initialState.openFilePaths,
    pickerOpen: false,
    rootFolder: initialState.rootFolder,
    selectedFilePath: initialState.selectedFilePath,
    openDefinition: (definitionTarget) => {
      set((state) => ({
        definitionTarget,
        editorStatus: null,
        openFilePaths: openFilePathList(
          state.openFilePaths,
          definitionTarget.path
        ),
        selectedFilePath: definitionTarget.path,
      }))
      return true
    },
    openPicker: () => set({ pickerOpen: true }),
    pickRootFolder: (rootFolder) =>
      set({
        definitionTarget: null,
        editorStatus: null,
        openFilePaths: [],
        pickerOpen: false,
        rootFolder,
        selectedFilePath: null,
      }),
    closeTab: (path) =>
      set((state) => {
        if (!state.openFilePaths.includes(path)) return state

        const openFilePaths = state.openFilePaths.filter(
          (filePath) => filePath !== path
        )
        const selectedFilePath =
          state.selectedFilePath === path
            ? nextSelectedFilePath(state.openFilePaths, path)
            : state.selectedFilePath

        return {
          definitionTarget:
            state.definitionTarget?.path === path
              ? null
              : state.definitionTarget,
          editorStatus:
            state.selectedFilePath === selectedFilePath
              ? state.editorStatus
              : null,
          openFilePaths,
          selectedFilePath,
        }
      }),
    selectFile: (selectedFilePath) =>
      set((state) => ({
        editorStatus: null,
        openFilePaths: selectedFilePath
          ? openFilePathList(state.openFilePaths, selectedFilePath)
          : state.openFilePaths,
        selectedFilePath,
      })),
    setEditorStatus: (status) =>
      set((state) => {
        const editorStatus = nextEditorStatus(state.editorStatus, status)
        if (editorStatus === state.editorStatus) return state

        return { editorStatus }
      }),
    setPickerOpen: (pickerOpen) => set({ pickerOpen }),
  }))
}

function openFilePathList(paths: readonly string[], path: string) {
  if (paths.includes(path)) return [...paths]

  return [...paths, path]
}

function nextSelectedFilePath(openFilePaths: readonly string[], path: string) {
  const closedIndex = openFilePaths.indexOf(path)
  if (closedIndex === -1) return null

  return openFilePaths[closedIndex + 1] ?? openFilePaths[closedIndex - 1] ?? null
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
