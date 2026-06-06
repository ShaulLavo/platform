import type { PickedFsEntry } from '@/lib/file-system-types'
import type { EditorDiffViewMode } from '@/features/editor/utils/diff-view-mode'
import {
  activeEditorPanePath,
  createEditorPaneLayoutForPaths,
  editorPaneOpenPaths,
  normalizeEditorPaneLayout,
  type EditorPaneLayout,
} from '@/features/editor/state/editor-pane-state'
import type { WorkspaceLayout } from '@/features/workbench/tiling-surface-manager/layout-types'
import {
  editorPaneLayoutForWorkspaceLayout,
  workspaceLayoutForEditorPaneLayout,
} from '@/features/workbench/tiling-surface-manager/workbench-editor-surface-layout'
import type { CachedWorkspaceState, WorkspacePanelTab } from '@/lib/workspace-cache'
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
  activateWorkspacePanelTab: (tab: WorkspacePanelTab) => void
  openPicker: () => void
  resetForRootFolder: (rootFolder: PickedFsEntry) => void
  setDiffViewMode: (mode: EditorDiffViewMode) => void
  setEditorPaneLayout: (layout: EditorPaneLayout) => void
  setEditorHistory: (paths: string[]) => void
  setGitPanelOpen: (open: boolean) => void
  setOpenFilePaths: (paths: string[]) => void
  setPickerOpen: (open: boolean) => void
  setRecentlyClosedEditorPaths: (paths: string[]) => void
  setSelectedFilePath: (path: string | null) => void
  setSidebarVisible: (visible: boolean) => void
  setWorkspaceLayout: (layout: WorkspaceLayout) => void
  setWorkspacePanelSelection: (selection: PanelSelection) => void
  setWorkspacePanelTab: (tab: WorkspacePanelTab) => void
}

export type EditorWorkspaceStore = EditorWorkspaceStoreState & EditorWorkspaceStoreActions

export type EditorWorkspaceStoreApi = StoreApi<EditorWorkspaceStore>

export const EditorWorkspaceStateContext = createContext<EditorWorkspaceStoreApi | null>(null)

type PanelSelection = Pick<EditorWorkspaceStoreState, 'sidebarVisible' | 'workspacePanelTab'>

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
  const initialWorkspaceLayout = workspaceLayoutForEditorPaneLayout(initialState.editorPaneLayout)

  return createStore<EditorWorkspaceStore>()((set) => ({
    diffViewMode: initialState.diffViewMode,
    editorHistory: initialState.editorHistory,
    editorPaneLayout: initialState.editorPaneLayout,
    gitPanelOpen: initialState.gitPanelOpen,
    openFilePaths: initialState.openFilePaths,
    pickerOpen: false,
    recentlyClosedEditorPaths: initialState.recentlyClosedEditorPaths,
    rootFolder: initialState.rootFolder,
    selectedFilePath: initialState.selectedFilePath,
    sidebarVisible: initialState.sidebarVisible,
    workspaceLayout: initialWorkspaceLayout,
    workspacePanelTab: initialState.workspacePanelTab,
    activateWorkspacePanelTab: (workspacePanelTab) =>
      set((state) => panelSelectionForTabActivation(state, workspacePanelTab)),
    openPicker: () => set({ pickerOpen: true }),
    resetForRootFolder: (rootFolder) =>
      set((state) => workspaceStateForRootFolderReset(rootFolder, state.diffViewMode)),
    setDiffViewMode: (diffViewMode) => set({ diffViewMode }),
    setEditorPaneLayout: (editorPaneLayout) =>
      set((state) =>
        editorWorkspaceSelectionForPaneLayout(editorPaneLayout, {
          currentOpenFilePaths: state.openFilePaths,
        }),
      ),
    setEditorHistory: (editorHistory) => set({ editorHistory }),
    setGitPanelOpen: (gitPanelOpen) => set({ gitPanelOpen }),
    setOpenFilePaths: (openFilePaths) =>
      set((state) =>
        editorWorkspaceSelectionForPaneLayout(
          createEditorPaneLayoutForPaths(
            pathsWithSelectedPath(openFilePaths, state.selectedFilePath),
            state.selectedFilePath,
          ),
          { currentOpenFilePaths: state.openFilePaths },
        ),
      ),
    setPickerOpen: (pickerOpen) => set({ pickerOpen }),
    setRecentlyClosedEditorPaths: (recentlyClosedEditorPaths) => set({ recentlyClosedEditorPaths }),
    setSelectedFilePath: (selectedFilePath) =>
      set((state) =>
        editorWorkspaceSelectionForPaneLayout(
          createEditorPaneLayoutForPaths(
            pathsWithSelectedPath(state.openFilePaths, selectedFilePath),
            selectedFilePath,
          ),
          { currentOpenFilePaths: state.openFilePaths },
        ),
      ),
    setSidebarVisible: (sidebarVisible) =>
      set((state) => {
        if (state.sidebarVisible === sidebarVisible) return state

        return { sidebarVisible }
      }),
    setWorkspaceLayout: (workspaceLayout) =>
      set((state) =>
        editorWorkspaceSelectionForWorkspaceLayout(workspaceLayout, {
          currentOpenFilePaths: state.openFilePaths,
        }),
      ),
    setWorkspacePanelSelection: (selection) =>
      set((state) => {
        if (
          state.sidebarVisible === selection.sidebarVisible &&
          state.workspacePanelTab === selection.workspacePanelTab
        )
          return state

        return selection
      }),
    setWorkspacePanelTab: (workspacePanelTab) =>
      set((state) => {
        if (state.workspacePanelTab === workspacePanelTab) return state

        return { workspacePanelTab }
      }),
  }))
}

function panelSelectionForTabActivation(
  current: PanelSelection,
  workspacePanelTab: WorkspacePanelTab,
): PanelSelection {
  if (current.sidebarVisible && current.workspacePanelTab === workspacePanelTab) {
    return { ...current, sidebarVisible: false }
  }

  return { sidebarVisible: true, workspacePanelTab }
}

function pathsWithSelectedPath(openFilePaths: readonly string[], selectedFilePath: string | null) {
  if (!selectedFilePath) return openFilePaths
  if (openFilePaths.includes(selectedFilePath)) return openFilePaths

  return openFilePaths.concat(selectedFilePath)
}

function workspaceStateForRootFolderReset(
  rootFolder: PickedFsEntry,
  diffViewMode: EditorDiffViewMode,
) {
  const workspaceLayout = workspaceLayoutForEditorPaneLayout(
    createEditorPaneLayoutForPaths([], null),
  )

  return {
    ...editorWorkspaceSelectionForWorkspaceLayout(workspaceLayout),
    diffViewMode,
    editorHistory: [],
    gitPanelOpen: true,
    pickerOpen: false,
    recentlyClosedEditorPaths: [],
    rootFolder,
    sidebarVisible: true,
    workspacePanelTab: 'files' as const,
  }
}

export function editorWorkspaceSelectionForPaneLayout(
  editorPaneLayout: EditorPaneLayout,
  options: { currentOpenFilePaths?: string[] } = {},
) {
  const normalized = normalizeEditorPaneLayout(editorPaneLayout)
  const workspaceLayout = workspaceLayoutForEditorPaneLayout(normalized)
  const openFilePaths = stableOpenFilePaths(
    options.currentOpenFilePaths,
    editorPaneOpenPaths(normalized),
  )

  return {
    editorPaneLayout: normalized,
    openFilePaths,
    selectedFilePath: activeEditorPanePath(normalized),
    workspaceLayout,
  }
}

export function editorWorkspaceSelectionForWorkspaceLayout(
  workspaceLayout: WorkspaceLayout,
  options: { currentOpenFilePaths?: string[] } = {},
) {
  const editorPaneLayout = editorPaneLayoutForWorkspaceLayout(workspaceLayout)
  const openFilePaths = stableOpenFilePaths(
    options.currentOpenFilePaths,
    editorPaneOpenPaths(editorPaneLayout),
  )

  return {
    editorPaneLayout,
    openFilePaths,
    selectedFilePath: activeEditorPanePath(editorPaneLayout),
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
