import type { PickedFsEntry } from "@/components/file-picker-dialog"
import type { EditorStatusBarState } from "@/components/editor/editor-status-bar"
import type { FileResult } from "@/lib/file-system-types"
import type {
  CachedWorkspaceState,
  WorkspacePanelTab,
} from "@/lib/workspace-cache"
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
  fallbackDocumentPath: string | null
  statusBarState: EditorStatusBarState | null
  pickerOpen: boolean
}

type EditorStoreActions = {
  closeTab: (path: string) => void
  discardCachedEditorDocument: (path: string) => { wasDirty: boolean }
  ensureCachedEditorDocument: (file: FileResult) => CachedEditorDocument
  forceReplaceCachedEditorDocument: (file: FileResult) => { wasDirty: boolean }
  getCachedEditorDocument: (path: string) => CachedEditorDocument | null
  openDefinition: (target: TypeScriptLspDefinitionTarget) => boolean
  openPicker: () => void
  pickRootFolder: (rootFolder: PickedFsEntry) => void
  renameCachedEditorDocument: (
    from: string,
    to: string
  ) => { wasDirty: boolean }
  selectFile: (path: string | null) => void
  setCachedEditorDocumentDirty: (path: string, dirty: boolean) => void
  setCachedEditorDocumentScrollPosition: (
    path: string,
    scrollPosition: EditorScrollPosition
  ) => void
  setStatusBarState: (status: EditorStatusBarState | null) => void
  setPickerOpen: (open: boolean) => void
  setWorkspacePanelTab: (tab: WorkspacePanelTab) => void
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
    fallbackDocumentPath: null,
    statusBarState: null,
    openFilePaths: initialState.openFilePaths,
    pickerOpen: false,
    rootFolder: initialState.rootFolder,
    selectedFilePath: initialState.selectedFilePath,
    workspacePanelTab: initialState.workspacePanelTab,
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
        fallbackDocumentPath:
          state.selectedFilePath === file.path
            ? file.path
            : state.fallbackDocumentPath,
      }))
      return document
    },
    getCachedEditorDocument: (path) => documentCache.get(path) ?? null,
    openDefinition: (definitionTarget) => {
      set((state) => ({
        definitionTarget,
        fallbackDocumentPath: fallbackDocumentPathForSelection(
          documentCache,
          state.selectedFilePath,
          state.fallbackDocumentPath
        ),
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
          fallbackDocumentPath: null,
          statusBarState: null,
          openFilePaths: [],
          pickerOpen: false,
          rootFolder,
          selectedFilePath: null,
          workspacePanelTab: "files",
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
            ? (removeDirtyFilePath(state.dirtyFilePaths, path) ??
              state.dirtyFilePaths)
            : state.dirtyFilePaths,
          documentCacheVersion: evicted
            ? state.documentCacheVersion + 1
            : state.documentCacheVersion,
          fallbackDocumentPath:
            state.fallbackDocumentPath === path
              ? fallbackDocumentPathForSelection(
                  documentCache,
                  selectedFilePath,
                  null
                )
              : state.fallbackDocumentPath,
          openFilePaths,
          selectedFilePath,
        }
      }),
    discardCachedEditorDocument: (path) => {
      let wasDirty = false
      set((state) => {
        wasDirty = isDirtyPath(documentCache, state.dirtyFilePaths, path)
        const hadCachedDocument = documentCache.delete(path)
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
          dirtyFilePaths:
            removeDirtyFilePath(state.dirtyFilePaths, path) ??
            state.dirtyFilePaths,
          documentCacheVersion:
            hadCachedDocument || state.openFilePaths.includes(path)
              ? state.documentCacheVersion + 1
              : state.documentCacheVersion,
          fallbackDocumentPath:
            state.fallbackDocumentPath === path
              ? fallbackDocumentPathForSelection(
                  documentCache,
                  selectedFilePath,
                  null
                )
              : state.fallbackDocumentPath,
          openFilePaths,
          selectedFilePath,
          statusBarState:
            state.selectedFilePath === selectedFilePath
              ? state.statusBarState
              : null,
        }
      })
      return { wasDirty }
    },
    forceReplaceCachedEditorDocument: (file) => {
      let wasDirty = false
      set((state) => {
        const cached = documentCache.get(file.path)
        wasDirty = isDirtyPath(documentCache, state.dirtyFilePaths, file.path)
        documentCache.set(file.path, freshCachedEditorDocument(file, cached))

        return {
          dirtyFilePaths:
            removeDirtyFilePath(state.dirtyFilePaths, file.path) ??
            state.dirtyFilePaths,
          documentCacheVersion: state.documentCacheVersion + 1,
          fallbackDocumentPath:
            state.selectedFilePath === file.path
              ? file.path
              : state.fallbackDocumentPath,
        }
      })
      return { wasDirty }
    },
    renameCachedEditorDocument: (from, to) => {
      let wasDirty = false
      set((state) => {
        wasDirty = isDirtyPath(documentCache, state.dirtyFilePaths, from)
        moveCachedEditorDocument(documentCache, from, to)

        return {
          definitionTarget:
            state.definitionTarget?.path === from
              ? { ...state.definitionTarget, path: to }
              : state.definitionTarget,
          dirtyFilePaths: renameDirtyFilePath(state.dirtyFilePaths, from, to),
          fallbackDocumentPath:
            state.fallbackDocumentPath === from
              ? to
              : state.fallbackDocumentPath,
          documentCacheVersion:
            state.openFilePaths.includes(from) || wasDirty
              ? state.documentCacheVersion + 1
              : state.documentCacheVersion,
          openFilePaths: renameOpenFilePath(state.openFilePaths, from, to),
          selectedFilePath:
            state.selectedFilePath === from ? to : state.selectedFilePath,
        }
      })
      return { wasDirty }
    },
    selectFile: (selectedFilePath) =>
      set((state) => ({
        fallbackDocumentPath: fallbackDocumentPathForSelection(
          documentCache,
          state.selectedFilePath,
          state.fallbackDocumentPath
        ),
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
    setWorkspacePanelTab: (workspacePanelTab) => set({ workspacePanelTab }),
  }))
}

function openFilePathList(paths: readonly string[], path: string) {
  if (paths.includes(path)) return [...paths]

  return [...paths, path]
}

function fallbackDocumentPathForSelection(
  documentCache: Map<string, CachedEditorDocument>,
  selectedFilePath: string | null,
  fallbackDocumentPath: string | null
) {
  if (selectedFilePath && documentCache.has(selectedFilePath)) {
    return selectedFilePath
  }
  if (fallbackDocumentPath && documentCache.has(fallbackDocumentPath)) {
    return fallbackDocumentPath
  }

  return null
}

function nextSelectedFilePath(openFilePaths: readonly string[], path: string) {
  const closedIndex = openFilePaths.indexOf(path)
  if (closedIndex === -1) return null

  return (
    openFilePaths[closedIndex + 1] ?? openFilePaths[closedIndex - 1] ?? null
  )
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

function freshCachedEditorDocument(
  file: FileResult,
  cached: CachedEditorDocument | undefined
): CachedEditorDocument {
  const session = createDocumentSession(file.content)
  session.markClean()

  return {
    path: file.path,
    revision: file.mtimeMs,
    scrollPosition: cached?.scrollPosition,
    session,
  }
}

function isDirtyPath(
  documentCache: Map<string, CachedEditorDocument>,
  dirtyFilePaths: ReadonlySet<string>,
  path: string
) {
  return (
    dirtyFilePaths.has(path) ||
    documentCache.get(path)?.session.isDirty() === true
  )
}

function moveCachedEditorDocument(
  documentCache: Map<string, CachedEditorDocument>,
  from: string,
  to: string
) {
  const cached = documentCache.get(from)
  if (!cached) return

  documentCache.delete(from)
  documentCache.set(to, { ...cached, path: to })
}

function renameOpenFilePath(
  paths: readonly string[],
  from: string,
  to: string
) {
  if (!paths.includes(from)) return [...paths]

  const renamed = paths.map((path) => (path === from ? to : path))
  return [...new Set(renamed)]
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

function renameDirtyFilePath(
  paths: ReadonlySet<string>,
  from: string,
  to: string
) {
  if (!paths.has(from)) return paths

  const nextPaths = new Set(paths)
  nextPaths.delete(from)
  nextPaths.add(to)
  return nextPaths
}
