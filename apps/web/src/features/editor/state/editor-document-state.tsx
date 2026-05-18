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
  type TextEdit,
} from "@editor/core"
import { createContext, useContext } from "react"
import { useStore } from "zustand"
import { createStore, type StoreApi } from "zustand/vanilla"

export type CachedEditorDocument = {
  contentRevision: string
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
  documentContentRevisions: Readonly<Record<string, string>>
  dirtyContentRevision: number
  dirtyFilePaths: ReadonlySet<string>
  documents: Readonly<Record<string, CachedEditorDocument>>
  fallbackDocumentPath: string | null
  scrollPositionByPath: Readonly<Record<string, EditorScrollPosition>>
  scrollPositionByTabId: Readonly<Record<string, EditorScrollPosition>>
  tabDocuments: Readonly<Record<string, CachedEditorDocument>>
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
  evictCleanCachedEditorTabDocument: (tabId: string) => boolean
  forceReplaceCachedEditorDocument: (
    file: FileResult,
    selectedFilePath?: string | null
  ) => { wasDirty: boolean }
  getCachedEditorDocument: (path: string) => CachedEditorDocument | null
  getCachedEditorTabDocument: (tabId: string) => CachedEditorDocument | null
  hasCachedEditorDocument: (path: string) => boolean
  ensureCachedEditorTabDocument: (
    tabId: string,
    file: FileResult
  ) => CachedEditorDocument
  markCachedEditorDocumentClean: (path: string, revision: number) => boolean
  recordCachedEditorDocumentTextChange: (
    path: string,
    options?: {
      sourceTabId?: string
      text?: string
      edits?: readonly TextEdit[]
    }
  ) => void
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
  setCachedEditorTabDocumentScrollPosition: (
    tabId: string,
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
    documentContentRevisions: {},
    dirtyContentRevision: 0,
    dirtyFilePaths: new Set(),
    documents: {},
    fallbackDocumentPath: null,
    scrollPositionByPath: {},
    scrollPositionByTabId: {},
    tabDocuments: {},
    clearCachedEditorDocuments: () =>
      set({
        documentContentRevisions: {},
        dirtyContentRevision: 0,
        dirtyFilePaths: new Set(),
        documents: {},
        fallbackDocumentPath: null,
        scrollPositionByPath: {},
        scrollPositionByTabId: {},
        tabDocuments: {},
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
          documentContentRevisions: omitKey(
            state.documentContentRevisions,
            path
          ),
          documents: omitKey(state.documents, path),
          dirtyFilePaths,
          scrollPositionByPath: omitKey(state.scrollPositionByPath, path),
          scrollPositionByTabId: omitTabPathValues(
            state.scrollPositionByTabId,
            state.tabDocuments,
            path
          ),
          tabDocuments: omitTabDocumentsForPath(state.tabDocuments, path),
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
        documentContentRevisions: {
          ...state.documentContentRevisions,
          [file.path]: contentRevisionForText(file.content),
        },
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
    ensureCachedEditorTabDocument: (tabId, file) => {
      const canonical = get().ensureCachedEditorDocument(file)
      const tabDocument = get().tabDocuments[tabId]
      if (
        tabDocument?.path === file.path &&
        (tabDocument.session.isDirty() ||
          tabDocument.contentRevision === canonical.contentRevision)
      ) {
        return cachedTabDocumentWithScroll(get(), tabId) ?? tabDocument
      }

      const document = {
        ...freshCachedEditorDocument(
          {
            ...file,
            content: canonical.session.getText(),
            mtimeMs: canonical.revision,
          },
          undefined,
          get().scrollPositionByTabId[tabId]
        ),
        contentRevision: canonical.contentRevision,
      }
      set((state) => ({
        tabDocuments: { ...state.tabDocuments, [tabId]: document },
      }))
      return document
    },
    evictCleanCachedEditorDocument: (path) => {
      const cached = get().documents[path]
      if (!cached) return false
      if (cached.session.isDirty()) return false

      set((state) => ({
        documentContentRevisions: omitKey(state.documentContentRevisions, path),
        documents: omitKey(state.documents, path),
        dirtyFilePaths:
          removeDirtyFilePath(state.dirtyFilePaths, path) ??
          state.dirtyFilePaths,
        scrollPositionByPath: omitKey(state.scrollPositionByPath, path),
        scrollPositionByTabId: omitTabPathValues(
          state.scrollPositionByTabId,
          state.tabDocuments,
          path
        ),
        tabDocuments: omitTabDocumentsForPath(state.tabDocuments, path),
      }))
      return true
    },
    evictCleanCachedEditorTabDocument: (tabId) => {
      const cached = get().tabDocuments[tabId]
      if (!cached) return false
      if (cached.session.isDirty()) return false

      set((state) => ({
        scrollPositionByTabId: omitKey(state.scrollPositionByTabId, tabId),
        tabDocuments: omitKey(state.tabDocuments, tabId),
      }))
      return true
    },
    forceReplaceCachedEditorDocument: (file, selectedFilePath = null) => {
      let wasDirty = false
      set((state) => {
        const cached = state.documents[file.path]
        wasDirty = isDirtyPath(state, file.path)
        const document = replacementCachedEditorDocument(file, cached)
        const contentRevision = replacementContentRevision(
          file,
          cached,
          state.documentContentRevisions[file.path]
        )
        const nextDocument =
          document.contentRevision === contentRevision
            ? document
            : { ...document, contentRevision }
        const dirtyFilePaths =
          removeDirtyFilePath(state.dirtyFilePaths, file.path) ??
          state.dirtyFilePaths
        const tabDocuments = replaceTabDocumentsForPath(
          state.tabDocuments,
          file,
          contentRevision
        )
        const fallbackDocumentPath =
          selectedFilePath === file.path
            ? file.path
            : state.fallbackDocumentPath
        if (
          !wasDirty &&
          nextDocument === cached &&
          contentRevision === state.documentContentRevisions[file.path] &&
          dirtyFilePaths === state.dirtyFilePaths &&
          fallbackDocumentPath === state.fallbackDocumentPath &&
          tabDocuments === state.tabDocuments
        )
          return state

        return {
          documentContentRevisions:
            contentRevision === state.documentContentRevisions[file.path]
              ? state.documentContentRevisions
              : {
                  ...state.documentContentRevisions,
                  [file.path]: contentRevision,
                },
          documents:
            nextDocument === cached
              ? state.documents
              : { ...state.documents, [file.path]: nextDocument },
          dirtyFilePaths,
          fallbackDocumentPath,
          tabDocuments,
        }
      })
      return { wasDirty }
    },
    getCachedEditorDocument: (path) => {
      const state = get()
      return cachedDocumentWithScroll(state, path)
    },
    getCachedEditorTabDocument: (tabId) =>
      cachedTabDocumentWithScroll(get(), tabId),
    hasCachedEditorDocument: (path) => get().documents[path] !== undefined,
    markCachedEditorDocumentClean: (path, revision) => {
      const cached = get().documents[path]
      if (!cached) return false

      cached.session.markClean()
      const contentRevision = contentRevisionForText(cached.session.getText())
      set((state) => ({
        documentContentRevisions:
          path in state.documentContentRevisions
            ? {
                ...state.documentContentRevisions,
                [path]: contentRevision,
              }
            : {
                ...state.documentContentRevisions,
                [path]: contentRevision,
              },
        documents: {
          ...state.documents,
          [path]: { ...cached, contentRevision, revision },
        },
        dirtyFilePaths:
          removeDirtyFilePath(state.dirtyFilePaths, path) ??
          state.dirtyFilePaths,
        tabDocuments: markTabDocumentsCleanForPath(
          state.tabDocuments,
          path,
          revision,
          contentRevision
        ),
      }))
      return true
    },
    recordCachedEditorDocumentTextChange: (path, options = {}) =>
      set((state) => {
        const contentRevision = editedContentRevision(
          state.dirtyContentRevision + 1
        )
        const text = changedDocumentText(state, path, options)
        const dirtyFilePaths =
          updateDirtyFilePaths(state.dirtyFilePaths, path, true) ??
          state.dirtyFilePaths
        const documents = recordCanonicalTextChange(
          state.documents,
          path,
          text,
          contentRevision,
          options.edits
        )
        const documentContentRevisions =
          path in state.documents
            ? {
                ...state.documentContentRevisions,
                [path]: contentRevision,
              }
            : state.documentContentRevisions

        return {
          documentContentRevisions,
          documents,
          dirtyContentRevision: state.dirtyContentRevision + 1,
          dirtyFilePaths,
          tabDocuments: syncTabDocumentsForPath(
            state.tabDocuments,
            path,
            options.sourceTabId ?? null,
            text,
            contentRevision,
            options.edits
          ),
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
            documentContentRevisions: moveValue(
              state.documentContentRevisions,
              from,
              to
            ),
            dirtyFilePaths: renameDirtyFilePath(state.dirtyFilePaths, from, to),
            fallbackDocumentPath:
              state.fallbackDocumentPath === from
                ? to
                : state.fallbackDocumentPath,
            tabDocuments: renameTabDocumentsPath(state.tabDocuments, from, to),
          }
        }

        return {
          documentContentRevisions: moveValue(
            state.documentContentRevisions,
            from,
            to
          ),
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
          tabDocuments: renameTabDocumentsPath(state.tabDocuments, from, to),
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
        const document = state.documents[path]
        if (!document) return state
        if (
          scrollPositionsEqual(state.scrollPositionByPath[path], scrollPosition)
        )
          return state

        return {
          documents: {
            ...state.documents,
            [path]: { ...document, scrollPosition },
          },
          scrollPositionByPath: {
            ...state.scrollPositionByPath,
            [path]: scrollPosition,
          },
        }
      })
    },
    setCachedEditorTabDocumentScrollPosition: (tabId, scrollPosition) => {
      set((state) => {
        const document = state.tabDocuments[tabId]
        if (!document) return state
        if (
          scrollPositionsEqual(
            state.scrollPositionByTabId[tabId],
            scrollPosition
          )
        )
          return state

        return {
          scrollPositionByTabId: {
            ...state.scrollPositionByTabId,
            [tabId]: scrollPosition,
          },
          tabDocuments: {
            ...state.tabDocuments,
            [tabId]: { ...document, scrollPosition },
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
    contentRevision: contentRevisionForText(file.content),
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

function replacementContentRevision(
  file: FileResult,
  cached: CachedEditorDocument | undefined,
  current: string | undefined
) {
  if (!cached) return contentRevisionForText(file.content)
  if (cached.session.getText() !== file.content)
    return contentRevisionForText(file.content)
  if (!cached.session.isDirty() && current) return current

  return contentRevisionForText(file.content)
}

function changedDocumentText(
  state: EditorDocumentStoreState,
  path: string,
  options: { sourceTabId?: string; text?: string }
) {
  if (options.text !== undefined) return options.text

  const sourceDocument = options.sourceTabId
    ? state.tabDocuments[options.sourceTabId]
    : null
  if (sourceDocument?.path === path) return sourceDocument.session.getText()

  return state.documents[path]?.session.getText() ?? ""
}

function recordCanonicalTextChange(
  documents: Readonly<Record<string, CachedEditorDocument>>,
  path: string,
  text: string,
  contentRevision: string,
  edits: readonly TextEdit[] | undefined
) {
  const document = documents[path]
  if (!document) return documents

  syncSessionText(document.session, text, edits)
  return {
    ...documents,
    [path]: {
      ...document,
      contentRevision,
    },
  }
}

function syncTabDocumentsForPath(
  tabDocuments: Readonly<Record<string, CachedEditorDocument>>,
  path: string,
  sourceTabId: string | null,
  text: string,
  contentRevision: string,
  edits: readonly TextEdit[] | undefined
) {
  let changed = false
  const nextEntries = Object.entries(tabDocuments).map(([tabId, document]) => {
    if (document.path !== path) return [tabId, document] as const

    if (tabId !== sourceTabId) {
      syncSessionText(document.session, text, edits)
    }

    changed = true
    return [tabId, { ...document, contentRevision }] as const
  })
  if (!changed) return tabDocuments

  return Object.fromEntries(nextEntries) as Readonly<
    Record<string, CachedEditorDocument>
  >
}

function replaceTabDocumentsForPath(
  tabDocuments: Readonly<Record<string, CachedEditorDocument>>,
  file: FileResult,
  contentRevision: string
) {
  let changed = false
  const nextEntries = Object.entries(tabDocuments).map(([tabId, document]) => {
    if (document.path !== file.path) return [tabId, document] as const

    syncSessionText(document.session, file.content)
    document.session.markClean()
    changed = true
    return [
      tabId,
      {
        ...document,
        contentRevision,
        revision: file.mtimeMs,
      },
    ] as const
  })
  if (!changed) return tabDocuments

  return Object.fromEntries(nextEntries) as Readonly<
    Record<string, CachedEditorDocument>
  >
}

function markTabDocumentsCleanForPath(
  tabDocuments: Readonly<Record<string, CachedEditorDocument>>,
  path: string,
  revision: number,
  contentRevision: string
) {
  let changed = false
  const nextEntries = Object.entries(tabDocuments).map(([tabId, document]) => {
    if (document.path !== path) return [tabId, document] as const

    document.session.markClean()
    changed = true
    return [tabId, { ...document, contentRevision, revision }] as const
  })
  if (!changed) return tabDocuments

  return Object.fromEntries(nextEntries) as Readonly<
    Record<string, CachedEditorDocument>
  >
}

function syncSessionText(
  session: DocumentSession,
  text: string,
  edits?: readonly TextEdit[]
) {
  if (session.getText() === text) return

  if (edits?.length) {
    session.applyEdits(edits, { history: "skip" })
    if (session.getText() === text) return
  }

  session.applyEdits([fullDocumentTextEdit(session, text)], {
    history: "skip",
  })
}

function fullDocumentTextEdit(session: DocumentSession, text: string) {
  return {
    from: 0,
    text,
    to: session.getSnapshot().length,
  }
}

function isDirtyPath(state: EditorDocumentStoreState, path: string) {
  if (state.dirtyFilePaths.has(path)) return true
  if (state.documents[path]?.session.isDirty() === true) return true

  return Object.values(state.tabDocuments).some(
    (document) => document.path === path && document.session.isDirty()
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

function renameTabDocumentsPath(
  tabDocuments: Readonly<Record<string, CachedEditorDocument>>,
  from: string,
  to: string
) {
  let changed = false
  const nextEntries = Object.entries(tabDocuments).map(([tabId, document]) => {
    if (document.path !== from) return [tabId, document] as const

    changed = true
    return [tabId, { ...document, path: to }] as const
  })
  if (!changed) return tabDocuments

  return Object.fromEntries(nextEntries) as Readonly<
    Record<string, CachedEditorDocument>
  >
}

function cachedDocumentWithScroll(
  state: EditorDocumentStoreState,
  path: string
): CachedEditorDocument | null {
  return state.documents[path] ?? null
}

function cachedTabDocumentWithScroll(
  state: EditorDocumentStoreState,
  tabId: string
): CachedEditorDocument | null {
  return state.tabDocuments[tabId] ?? null
}

function scrollPositionsEqual(
  current: EditorScrollPosition | undefined,
  next: EditorScrollPosition
) {
  if (!current) return false

  return current.left === next.left && current.top === next.top
}

function contentRevisionForText(text: string) {
  let hash = 0x811c9dc5

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }

  return `h:${text.length.toString(36)}:${(hash >>> 0).toString(36)}`
}

function editedContentRevision(revision: number) {
  return `e:${revision.toString(36)}`
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

function omitTabDocumentsForPath(
  tabDocuments: Readonly<Record<string, CachedEditorDocument>>,
  path: string
) {
  return Object.fromEntries(
    Object.entries(tabDocuments).filter(
      ([, document]) => document.path !== path
    )
  ) as Readonly<Record<string, CachedEditorDocument>>
}

function omitTabPathValues<T>(
  record: Readonly<Record<string, T>>,
  tabDocuments: Readonly<Record<string, CachedEditorDocument>>,
  path: string
) {
  return Object.fromEntries(
    Object.entries(record).filter(
      ([tabId]) => tabDocuments[tabId]?.path !== path
    )
  ) as Readonly<Record<string, T>>
}
