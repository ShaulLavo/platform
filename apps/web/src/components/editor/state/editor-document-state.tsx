import {
  removeDirtyFilePath,
  renameDirtyFilePath,
  updateDirtyFilePaths,
} from "@/components/editor/state/editor-dirty-paths"
import type { FileResult } from "@/lib/file-system-types"
import {
  createDocumentSession,
  type DocumentSession,
  type EditorScrollPosition,
} from "@editor/core"
import { createContext, useContext } from "react"
import { useStore } from "zustand"
import { createStore, type StoreApi } from "zustand/vanilla"

export type CachedEditorDocument = {
  path: string
  revision: number
  scrollPosition?: EditorScrollPosition
  session: DocumentSession
}

export type DeleteCachedEditorDocumentResult = {
  hadCachedDocument: boolean
  wasDirty: boolean
}

type EditorDocumentStoreState = {
  dirtyFilePaths: ReadonlySet<string>
  documentCacheVersion: number
  fallbackDocumentPath: string | null
}

type EditorDocumentStoreActions = {
  clearCachedEditorDocuments: () => void
  deleteCachedEditorDocument: (
    path: string,
    options?: { bumpVersion?: boolean }
  ) => DeleteCachedEditorDocumentResult
  ensureCachedEditorDocument: (
    file: FileResult,
    selectedFilePath?: string | null
  ) => CachedEditorDocument
  evictCleanCachedEditorDocument: (path: string) => boolean
  forceReplaceCachedEditorDocument: (
    file: FileResult,
    selectedFilePath?: string | null
  ) => { wasDirty: boolean }
  getCachedEditorDocument: (path: string) => CachedEditorDocument | null
  hasCachedEditorDocument: (path: string) => boolean
  renameCachedEditorDocumentPath: (
    from: string,
    to: string,
    options?: { bumpVersion?: boolean }
  ) => { wasDirty: boolean }
  setCachedEditorDocumentDirty: (path: string, dirty: boolean) => void
  setCachedEditorDocumentScrollPosition: (
    path: string,
    scrollPosition: EditorScrollPosition
  ) => void
  setFallbackDocumentPath: (path: string | null) => void
}

export type EditorDocumentStore = EditorDocumentStoreState &
  EditorDocumentStoreActions

export type EditorDocumentStoreApi = StoreApi<EditorDocumentStore>

export const EditorDocumentStateContext =
  createContext<EditorDocumentStoreApi | null>(null)

export function useEditorDocumentStoreApi() {
  const store = useContext(EditorDocumentStateContext)
  if (!store) {
    throw new Error(
      "useEditorDocumentStoreApi must be used within EditorStateProvider"
    )
  }

  return store
}

export function useEditorDocumentState<T>(
  selector: (state: EditorDocumentStore) => T
): T {
  return useStore(useEditorDocumentStoreApi(), selector)
}

export function createEditorDocumentStore() {
  const documentCache = new Map<string, CachedEditorDocument>()

  return createStore<EditorDocumentStore>()((set) => ({
    dirtyFilePaths: new Set(),
    documentCacheVersion: 0,
    fallbackDocumentPath: null,
    clearCachedEditorDocuments: () =>
      set((state) => {
        documentCache.clear()
        return {
          dirtyFilePaths: new Set(),
          documentCacheVersion: state.documentCacheVersion + 1,
          fallbackDocumentPath: null,
        }
      }),
    deleteCachedEditorDocument: (path, options) => {
      let result: DeleteCachedEditorDocumentResult = {
        hadCachedDocument: false,
        wasDirty: false,
      }
      set((state) => {
        const wasDirty = isDirtyPath(
          documentCache,
          state.dirtyFilePaths,
          path
        )
        const hadCachedDocument = documentCache.delete(path)
        result = {
          hadCachedDocument,
          wasDirty,
        }
        const dirtyFilePaths =
          removeDirtyFilePath(state.dirtyFilePaths, path) ??
          state.dirtyFilePaths
        const shouldBumpVersion =
          result.hadCachedDocument || options?.bumpVersion === true

        return {
          dirtyFilePaths,
          documentCacheVersion: shouldBumpVersion
            ? state.documentCacheVersion + 1
            : state.documentCacheVersion,
        }
      })
      return result
    },
    ensureCachedEditorDocument: (file, selectedFilePath = null) => {
      const cached = documentCache.get(file.path)
      if (cached?.session.isDirty()) return cached
      if (cached?.revision === file.mtimeMs) return cached

      const document = freshCachedEditorDocument(file, cached)
      documentCache.set(file.path, document)
      set((state) => ({
        dirtyFilePaths:
          removeDirtyFilePath(state.dirtyFilePaths, file.path) ??
          state.dirtyFilePaths,
        documentCacheVersion: state.documentCacheVersion + 1,
        fallbackDocumentPath:
          selectedFilePath === file.path
            ? file.path
            : state.fallbackDocumentPath,
      }))
      return document
    },
    evictCleanCachedEditorDocument: (path) => {
      const cached = documentCache.get(path)
      if (!cached) return false
      if (cached.session.isDirty()) return false

      documentCache.delete(path)
      set((state) => ({
        dirtyFilePaths:
          removeDirtyFilePath(state.dirtyFilePaths, path) ??
          state.dirtyFilePaths,
        documentCacheVersion: state.documentCacheVersion + 1,
      }))
      return true
    },
    forceReplaceCachedEditorDocument: (file, selectedFilePath = null) => {
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
            selectedFilePath === file.path
              ? file.path
              : state.fallbackDocumentPath,
        }
      })
      return { wasDirty }
    },
    getCachedEditorDocument: (path) => documentCache.get(path) ?? null,
    hasCachedEditorDocument: (path) => documentCache.has(path),
    renameCachedEditorDocumentPath: (from, to, options) => {
      let wasDirty = false
      set((state) => {
        wasDirty = isDirtyPath(documentCache, state.dirtyFilePaths, from)
        moveCachedEditorDocument(documentCache, from, to)

        return {
          dirtyFilePaths: renameDirtyFilePath(state.dirtyFilePaths, from, to),
          documentCacheVersion:
            options?.bumpVersion === true || wasDirty
              ? state.documentCacheVersion + 1
              : state.documentCacheVersion,
          fallbackDocumentPath:
            state.fallbackDocumentPath === from
              ? to
              : state.fallbackDocumentPath,
        }
      })
      return { wasDirty }
    },
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
    setFallbackDocumentPath: (fallbackDocumentPath) =>
      set({ fallbackDocumentPath }),
  }))
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
