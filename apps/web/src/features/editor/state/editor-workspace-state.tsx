import type { PickedFsEntry } from '@/lib/file-system-types'
import type { EditorDiffViewMode } from '@/features/editor/utils/diff-view-mode'
import {
  activeEditorPathForWorkspaceLayout,
  editorOpenPathsForWorkspaceLayout,
} from '@/features/workbench/utils/editor-surface-layout'
import type { WorkspaceLayout } from '@workspace/tiling/utils/layout-types'
import { createClassicFirstRunWorkspaceLayout } from '@workspace/tiling/utils/layout-builders'
import type { CachedWorkspaceState } from '@/lib/workspace-cache'
import { readWorkspaceCache } from '@/lib/workspace-cache'
import { clientErrors } from '@/lib/structured-errors'
import { createContext, use } from 'react'
import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'

type EditorWorkspaceStoreState = CachedWorkspaceState & {
  pickerOpen: boolean
  workspaceLayout: WorkspaceLayout
}

type EditorWorkspaceStoreActions = {
  openPicker: () => void
  resetForRootFolder: (rootFolder: PickedFsEntry) => void
  setDiffViewMode: (mode: EditorDiffViewMode) => void
  setEditorHistory: (paths: string[]) => void
  setPickerOpen: (open: boolean) => void
  setRecentlyClosedEditorPaths: (paths: string[]) => void
  setWorkspaceLayout: (layout: WorkspaceLayout) => void
}

export type EditorWorkspaceStore = EditorWorkspaceStoreState & EditorWorkspaceStoreActions

export type EditorWorkspaceStoreApi = StoreApi<EditorWorkspaceStore>

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
  return createStore<EditorWorkspaceStore>()((set) => ({
    diffViewMode: initialState.diffViewMode,
    editorHistory: initialState.editorHistory,
    openFilePaths: initialState.openFilePaths,
    pickerOpen: false,
    recentlyClosedEditorPaths: initialState.recentlyClosedEditorPaths,
    rootFolder: initialState.rootFolder,
    selectedFilePath: initialState.selectedFilePath,
    workspaceLayout: initialState.workspaceLayout,
    openPicker: () => set({ pickerOpen: true }),
    resetForRootFolder: (rootFolder) =>
      set((state) => workspaceStateForRootFolderReset(rootFolder, state.diffViewMode)),
    setDiffViewMode: (diffViewMode) => set({ diffViewMode }),
    setEditorHistory: (editorHistory) => set({ editorHistory }),
    setPickerOpen: (pickerOpen) => set({ pickerOpen }),
    setRecentlyClosedEditorPaths: (recentlyClosedEditorPaths) => set({ recentlyClosedEditorPaths }),
    setWorkspaceLayout: (workspaceLayout) =>
      set((state) =>
        editorWorkspaceSelectionForWorkspaceLayout(workspaceLayout, {
          currentOpenFilePaths: state.openFilePaths,
        }),
      ),
  }))
}

function workspaceStateForRootFolderReset(
  rootFolder: PickedFsEntry,
  diffViewMode: EditorDiffViewMode,
) {
  const workspaceLayout = createClassicFirstRunWorkspaceLayout()

  return {
    ...editorWorkspaceSelectionForWorkspaceLayout(workspaceLayout),
    diffViewMode,
    editorHistory: [],
    pickerOpen: false,
    recentlyClosedEditorPaths: [],
    rootFolder,
  }
}

export function editorWorkspaceSelectionForWorkspaceLayout(
  workspaceLayout: WorkspaceLayout,
  options: { currentOpenFilePaths?: string[] } = {},
) {
  const openFilePaths = stableOpenFilePaths(
    options.currentOpenFilePaths,
    editorOpenPathsForWorkspaceLayout(workspaceLayout),
  )

  return {
    openFilePaths,
    selectedFilePath: activeEditorPathForWorkspaceLayout(workspaceLayout),
    workspaceLayout,
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
