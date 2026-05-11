import {
  removeDirtyFilePath,
  renameDirtyFilePath,
  updateDirtyFilePaths,
} from "@/features/editor/state/editor-dirty-paths"
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
  dirtyContentRevision: number
  dirtyFilePaths: ReadonlySet<string>
  documents: Readonly<Record<string, CachedEditorDocument>>
  fallbackDocumentPath: string | null
  scrollPositionByPath: Readonly<Record<string, EditorScrollPosition>>
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
  markCachedEditorDocumentClean: (path: string, revision: number) => boolean
  recordCachedEditorDocumentTextChange: (path: string) => void
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
  return createStore<EditorDocumentStore>()((set, get) => ({
    dirtyContentRevision: 0,
    dirtyFilePaths: new Set(),
    documents: {},
    fallbackDocumentPath: null,
    scrollPositionByPath: {},
    clearCachedEditorDocuments: () =>
      set({
        dirtyContentRevision: 0,
        dirtyFilePaths: new Set(),
        documents: {},
        fallbackDocumentPath: null,
        scrollPositionByPath: {},
      }),
    deleteCachedEditorDocument: (path, options) => {
      let result: DeleteCachedEditorDocumentResult = {
        hadCachedDocument: false,
        wasDirty: false,
      }
      set((state) => {
        const wasDirty = isDirtyPath(state, path)
        const hadCachedDocument = state.documents[path] !== undefined
        result = {
          hadCachedDocument,
          wasDirty,
        }
        const dirtyFilePaths =
          removeDirtyFilePath(state.dirtyFilePaths, path) ??
          state.dirtyFilePaths
        const shouldBumpVersion =
          result.hadCachedDocument || options?.bumpVersion === true
        if (!shouldBumpVersion) return { dirtyFilePaths }

        return {
          documents: omitKey(state.documents, path),
          dirtyFilePaths,
          scrollPositionByPath: omitKey(state.scrollPositionByPath, path),
        }
      })
      return result
    },
    ensureCachedEditorDocument: (file, selectedFilePath = null) => {
      const state = get()
      const cached = state.documents[file.path]
      if (cached?.session.isDirty()) return cached
      if (cached?.revision === file.mtimeMs) return cached

      const document = freshCachedEditorDocument(
        file,
        cached,
        state.scrollPositionByPath[file.path]
      )
      set((state) => ({
        documents: { ...state.documents, [file.path]: document },
        dirtyFilePaths:
          removeDirtyFilePath(state.dirtyFilePaths, file.path) ??
          state.dirtyFilePaths,
        fallbackDocumentPath:
          selectedFilePath === file.path
            ? file.path
            : state.fallbackDocumentPath,
      }))
      return document
    },
    evictCleanCachedEditorDocument: (path) => {
      const cached = get().documents[path]
      if (!cached) return false
      if (cached.session.isDirty()) return false

      set((state) => ({
        documents: omitKey(state.documents, path),
        dirtyFilePaths:
          removeDirtyFilePath(state.dirtyFilePaths, path) ??
          state.dirtyFilePaths,
        scrollPositionByPath: omitKey(state.scrollPositionByPath, path),
      }))
      return true
    },
    forceReplaceCachedEditorDocument: (file, selectedFilePath = null) => {
      let wasDirty = false
      set((state) => {
        const cached = state.documents[file.path]
        wasDirty = isDirtyPath(state, file.path)
        const document = replacementCachedEditorDocument(file, cached)
        const dirtyFilePaths =
          removeDirtyFilePath(state.dirtyFilePaths, file.path) ??
          state.dirtyFilePaths
        const fallbackDocumentPath =
          selectedFilePath === file.path
            ? file.path
            : state.fallbackDocumentPath
        if (
          !wasDirty &&
          document === cached &&
          dirtyFilePaths === state.dirtyFilePaths &&
          fallbackDocumentPath === state.fallbackDocumentPath
        )
          return state

        return {
          documents:
            document === cached
              ? state.documents
              : { ...state.documents, [file.path]: document },
          dirtyFilePaths,
          fallbackDocumentPath,
        }
      })
      return { wasDirty }
    },
    getCachedEditorDocument: (path) => {
      const state = get()
      return cachedDocumentWithScroll(state, path)
    },
    hasCachedEditorDocument: (path) => get().documents[path] !== undefined,
    markCachedEditorDocumentClean: (path, revision) => {
      const cached = get().documents[path]
      if (!cached) return false

      cached.session.markClean()
      set((state) => ({
        documents: {
          ...state.documents,
          [path]: { ...cached, revision },
        },
        dirtyFilePaths:
          removeDirtyFilePath(state.dirtyFilePaths, path) ??
          state.dirtyFilePaths,
      }))
      return true
    },
    recordCachedEditorDocumentTextChange: (path) =>
      set((state) => {
        const dirtyFilePaths =
          updateDirtyFilePaths(state.dirtyFilePaths, path, true) ??
          state.dirtyFilePaths

        return {
          dirtyContentRevision: state.dirtyContentRevision + 1,
          dirtyFilePaths,
        }
      }),
    renameCachedEditorDocumentPath: (from, to, options) => {
      let wasDirty = false
      set((state) => {
        wasDirty = isDirtyPath(state, from)
        const document = state.documents[from]
        const scrollPosition = state.scrollPositionByPath[from]
        const shouldMove = document || options?.bumpVersion === true || wasDirty
        if (!shouldMove) {
          return {
            dirtyFilePaths: renameDirtyFilePath(state.dirtyFilePaths, from, to),
            fallbackDocumentPath:
              state.fallbackDocumentPath === from
                ? to
                : state.fallbackDocumentPath,
          }
        }

        return {
          documents: moveCachedEditorDocument(state.documents, from, to),
          dirtyFilePaths: renameDirtyFilePath(state.dirtyFilePaths, from, to),
          fallbackDocumentPath:
            state.fallbackDocumentPath === from
              ? to
              : state.fallbackDocumentPath,
          scrollPositionByPath:
            scrollPosition === undefined
              ? state.scrollPositionByPath
              : moveValue(state.scrollPositionByPath, from, to),
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
      set((state) => {
        if (!state.documents[path]) return state
        if (
          scrollPositionsEqual(state.scrollPositionByPath[path], scrollPosition)
        )
          return state

        return {
          scrollPositionByPath: {
            ...state.scrollPositionByPath,
            [path]: scrollPosition,
          },
        }
      })
    },
    setFallbackDocumentPath: (fallbackDocumentPath) =>
      set({ fallbackDocumentPath }),
  }))
}

function freshCachedEditorDocument(
  file: FileResult,
  cached: CachedEditorDocument | undefined,
  scrollPosition?: EditorScrollPosition
): CachedEditorDocument {
  const session = createDocumentSession(file.content)
  session.markClean()

  return {
    path: file.path,
    revision: file.mtimeMs,
    scrollPosition: scrollPosition ?? cached?.scrollPosition,
    session,
  }
}

function replacementCachedEditorDocument(
  file: FileResult,
  cached: CachedEditorDocument | undefined
): CachedEditorDocument {
  if (!cached) return freshCachedEditorDocument(file, cached)
  if (cached.session.getText() !== file.content)
    return freshCachedEditorDocument(file, cached)

  cached.session.markClean()
  if (cached.revision === file.mtimeMs) return cached

  return {
    ...cached,
    revision: file.mtimeMs,
  }
}

function isDirtyPath(state: EditorDocumentStoreState, path: string) {
  return (
    state.dirtyFilePaths.has(path) ||
    state.documents[path]?.session.isDirty() === true
  )
}

function moveCachedEditorDocument(
  documents: Readonly<Record<string, CachedEditorDocument>>,
  from: string,
  to: string
): Readonly<Record<string, CachedEditorDocument>> {
  const cached = documents[from]
  if (!cached) return documents

  return { ...omitKey(documents, from), [to]: { ...cached, path: to } }
}

function cachedDocumentWithScroll(
  state: EditorDocumentStoreState,
  path: string
): CachedEditorDocument | null {
  const document = state.documents[path]
  if (!document) return null

  const scrollPosition = state.scrollPositionByPath[path]
  if (scrollPosition === undefined) return document
  if (document.scrollPosition === scrollPosition) return document

  return { ...document, scrollPosition }
}

function scrollPositionsEqual(
  current: EditorScrollPosition | undefined,
  next: EditorScrollPosition
) {
  if (!current) return false

  return current.left === next.left && current.top === next.top
}

function omitKey<T>(
  record: Readonly<Record<string, T>>,
  key: string
): Readonly<Record<string, T>> {
  if (!(key in record)) return record

  return Object.fromEntries(
    Object.entries(record).filter(([entryKey]) => entryKey !== key)
  ) as Readonly<Record<string, T>>
}

function moveValue<T>(
  record: Readonly<Record<string, T>>,
  from: string,
  to: string
): Readonly<Record<string, T>> {
  const value = record[from]
  if (value === undefined) return record

  return { ...omitKey(record, from), [to]: value }
}
