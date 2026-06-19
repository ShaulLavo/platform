import type { PickedFsEntry } from '@/lib/file-system-types'
import type { EditorDiffViewMode } from '@/features/editor/utils/diff-view-mode'
import {
  activeEditorPathForWorkbenchPanels,
  createDefaultWorkbenchPanels,
  editorOpenPathsForWorkbenchPanels,
  normalizeWorkbenchPanels,
  type WorkbenchPanels,
} from '@/features/workbench/utils/workbench-panels'
import type { CachedWorkspaceState } from '@/lib/workspace-cache'
import { readWorkspaceCache } from '@/lib/workspace-cache'
import { clientErrors } from '@/lib/structured-errors'
import { createContext, use } from 'react'
import { useStore } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { createStore, type Mutate, type StoreApi } from 'zustand/vanilla'

type EditorWorkspaceStoreState = CachedWorkspaceState & {
  pickerOpen: boolean
  workbenchPanels: WorkbenchPanels
}

type EditorWorkspaceStoreActions = {
  clearRootFolder: () => void
  openPicker: () => void
  resetForRootFolder: (rootFolder: PickedFsEntry) => void
  setDiffViewMode: (mode: EditorDiffViewMode) => void
  setEditorHistory: (paths: string[]) => void
  setPickerOpen: (open: boolean) => void
  setRecentlyClosedEditorPaths: (paths: string[]) => void
  setWorkbenchPanels: (panels: WorkbenchPanels) => void
}

export type EditorWorkspaceStore = EditorWorkspaceStoreState & EditorWorkspaceStoreActions

export type EditorWorkspaceStoreApi = Mutate<
  StoreApi<EditorWorkspaceStore>,
  [['zustand/subscribeWithSelector', never]]
>

export const EditorWorkspaceStateContext = createContext<EditorWorkspaceStoreApi | null>(null)

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
  return createStore<EditorWorkspaceStore>()(
    subscribeWithSelector((set) => ({
      diffViewMode: initialState.diffViewMode,
      editorHistory: initialState.editorHistory,
      openFilePaths: initialState.openFilePaths,
      pickerOpen: false,
      recentlyClosedEditorPaths: initialState.recentlyClosedEditorPaths,
      rootFolder: initialState.rootFolder,
      selectedFilePath: initialState.selectedFilePath,
      workbenchPanels: initialState.workbenchPanels,
      clearRootFolder: () =>
        set((state) => workspaceStateForRootFolderReset(null, state.diffViewMode)),
      openPicker: () => set({ pickerOpen: true }),
      resetForRootFolder: (rootFolder) =>
        set((state) => workspaceStateForRootFolderReset(rootFolder, state.diffViewMode)),
      setDiffViewMode: (diffViewMode) => set({ diffViewMode }),
      setEditorHistory: (editorHistory) => set({ editorHistory }),
      setPickerOpen: (pickerOpen) => set({ pickerOpen }),
      setRecentlyClosedEditorPaths: (recentlyClosedEditorPaths) =>
        set({ recentlyClosedEditorPaths }),
      setWorkbenchPanels: (workbenchPanels) =>
        set((state) =>
          editorWorkspaceSelectionForWorkbenchPanels(workbenchPanels, {
            currentOpenFilePaths: state.openFilePaths,
          }),
        ),
    })),
  )
}

function workspaceStateForRootFolderReset(
  rootFolder: PickedFsEntry | null,
  diffViewMode: EditorDiffViewMode,
) {
  const workbenchPanels = createDefaultWorkbenchPanels()

  return {
    ...editorWorkspaceSelectionForWorkbenchPanels(workbenchPanels),
    diffViewMode,
    editorHistory: [],
    pickerOpen: false,
    recentlyClosedEditorPaths: [],
    rootFolder,
  }
}

export function editorWorkspaceSelectionForWorkbenchPanels(
  workbenchPanels: WorkbenchPanels,
  options: { currentOpenFilePaths?: string[] } = {},
) {
  const normalizedPanels = normalizeWorkbenchPanels(workbenchPanels)
  const openFilePaths = stableOpenFilePaths(
    options.currentOpenFilePaths,
    editorOpenPathsForWorkbenchPanels(normalizedPanels),
  )

  return {
    openFilePaths,
    selectedFilePath: activeEditorPathForWorkbenchPanels(normalizedPanels),
    workbenchPanels: normalizedPanels,
  }
}

function stableOpenFilePaths(current: string[] | undefined, next: string[]) {
  if (!current) return next
  if (!sameOpenFilePaths(current, next)) return next

  return current
}

function sameOpenFilePaths(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) return false

  return left.every((path, index) => path === right[index])
}
