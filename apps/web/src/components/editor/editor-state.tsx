import type { PickedFsEntry } from "@/components/file-picker-dialog"
import type { EditorStatusBarState } from "@/components/editor/editor-status-bar"
import type { FileResult } from "@/lib/file-system-types"
import type { CachedWorkspaceState } from "@/lib/workspace-cache"
import { readWorkspaceCache } from "@/lib/workspace-cache"
import {
  createDocumentSession,
  type DocumentSession,
  type EditorScrollPosition,
} from "@editor/core"
import type { TypeScriptLspDefinitionTarget } from "@editor/typescript-lsp"
import { createContext, useContext } from "react"
import { useStore } from "zustand"
import { createStore, type StoreApi } from "zustand/vanilla"

export type CachedEditorDocument = {
  path: string
  revision: number
  scrollPosition?: EditorScrollPosition
  session: DocumentSession
}

type EditorStoreState = CachedWorkspaceState & {
  definitionTarget: TypeScriptLspDefinitionTarget | null
  dirtyFilePaths: ReadonlySet<string>
  documentCacheVersion: number
  statusBarState: EditorStatusBarState | null
  pickerOpen: boolean
}

type EditorStoreActions = {
  closeTab: (path: string) => void
  ensureCachedEditorDocument: (file: FileResult) => CachedEditorDocument
  getCachedEditorDocument: (path: string) => CachedEditorDocument | null
  openDefinition: (target: TypeScriptLspDefinitionTarget) => boolean
  openPicker: () => void
  pickRootFolder: (rootFolder: PickedFsEntry) => void
  selectFile: (path: string | null) => void
  setCachedEditorDocumentDirty: (path: string, dirty: boolean) => void
  setCachedEditorDocumentScrollPosition: (
    path: string,
    scrollPosition: EditorScrollPosition
  ) => void
  setStatusBarState: (status: EditorStatusBarState | null) => void
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
  const documentCache = new Map<string, CachedEditorDocument>()

  return createStore<EditorStore>()((set) => ({
    definitionTarget: null,
    dirtyFilePaths: new Set(),
    documentCacheVersion: 0,
    statusBarState: null,
    openFilePaths: initialState.openFilePaths,
    pickerOpen: false,
    rootFolder: initialState.rootFolder,
    selectedFilePath: initialState.selectedFilePath,
    ensureCachedEditorDocument: (file) => {
      const cached = documentCache.get(file.path)
      if (cached && cached.session.isDirty()) return cached
      if (cached && cached.revision === file.mtimeMs) return cached

      const session = createDocumentSession(file.content)
      session.markClean()
      const document = {
        path: file.path,
        revision: file.mtimeMs,
        scrollPosition: cached?.scrollPosition,
        session,
      }

      documentCache.set(file.path, document)
      set((state) => ({
        dirtyFilePaths:
          removeDirtyFilePath(state.dirtyFilePaths, file.path) ??
          state.dirtyFilePaths,
        documentCacheVersion: state.documentCacheVersion + 1,
      }))
      return document
    },
    getCachedEditorDocument: (path) => documentCache.get(path) ?? null,
    openDefinition: (definitionTarget) => {
      set((state) => ({
        definitionTarget,
        statusBarState: null,
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
      set((state) => {
        documentCache.clear()
        return {
          definitionTarget: null,
          dirtyFilePaths: new Set(),
          documentCacheVersion: state.documentCacheVersion + 1,
          statusBarState: null,
          openFilePaths: [],
          pickerOpen: false,
          rootFolder,
          selectedFilePath: null,
        }
      }),
    closeTab: (path) =>
      set((state) => {
        if (!state.openFilePaths.includes(path)) return state

        const evicted = evictCleanCachedEditorDocument(documentCache, path)
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
          statusBarState:
            state.selectedFilePath === selectedFilePath
              ? state.statusBarState
              : null,
          dirtyFilePaths: evicted
            ? removeDirtyFilePath(state.dirtyFilePaths, path) ??
              state.dirtyFilePaths
            : state.dirtyFilePaths,
          documentCacheVersion: evicted
            ? state.documentCacheVersion + 1
            : state.documentCacheVersion,
          openFilePaths,
          selectedFilePath,
        }
      }),
    selectFile: (selectedFilePath) =>
      set((state) => ({
        statusBarState: null,
        openFilePaths: selectedFilePath
          ? openFilePathList(state.openFilePaths, selectedFilePath)
          : state.openFilePaths,
        selectedFilePath,
      })),
    setCachedEditorDocumentDirty: (path, dirty) =>
      set((state) => {
        const dirtyFilePaths = updateDirtyFilePaths(
          state.dirtyFilePaths,
          path,
          dirty
        )
        if (!dirtyFilePaths) return state

        return { dirtyFilePaths }
      }),
    setCachedEditorDocumentScrollPosition: (path, scrollPosition) => {
      const cached = documentCache.get(path)
      if (!cached) return

      cached.scrollPosition = scrollPosition
    },
    setStatusBarState: (status) =>
      set((state) => {
        if (status === state.statusBarState) return state

        return { statusBarState: status }
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

function evictCleanCachedEditorDocument(
  documentCache: Map<string, CachedEditorDocument>,
  path: string
) {
  const cached = documentCache.get(path)
  if (!cached) return false
  if (cached.session.isDirty()) return false

  documentCache.delete(path)
  return true
}

function updateDirtyFilePaths(
  paths: ReadonlySet<string>,
  path: string,
  dirty: boolean
) {
  if (dirty && paths.has(path)) return null
  if (!dirty && !paths.has(path)) return null

  const nextPaths = new Set(paths)
  if (dirty) {
    nextPaths.add(path)
    return nextPaths
  }

  nextPaths.delete(path)
  return nextPaths
}

function removeDirtyFilePath(paths: ReadonlySet<string>, path: string) {
  return updateDirtyFilePaths(paths, path, false)
}
