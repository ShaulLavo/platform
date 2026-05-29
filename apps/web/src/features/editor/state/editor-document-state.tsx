import { clientErrors } from '@/lib/structured-errors'
import type { FileResult } from '@/lib/file-system-types'
import {
  type DocumentSessionChange,
  type EditorScrollPosition,
  type TextEdit,
} from '@editor/core'
import { createContext, use } from 'react'
import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'
import {
  WorkspaceDocumentService,
  type WorkspaceDocumentProjection,
} from '@/features/editor/state/workspace-document-service'

export type CachedEditorDocument = WorkspaceDocumentProjection

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
    options?: { bumpVersion?: boolean },
  ) => DeleteCachedEditorDocumentResult
  ensureCachedEditorDocument: (
    file: FileResult,
    selectedFilePath?: string | null,
  ) => CachedEditorDocument
  evictCleanCachedEditorDocument: (path: string) => boolean
  evictCleanCachedEditorTabDocument: (tabId: string) => boolean
  forceReplaceCachedEditorDocument: (
    file: FileResult,
    selectedFilePath?: string | null,
  ) => { wasDirty: boolean }
  getCachedEditorDocument: (path: string) => CachedEditorDocument | null
  getCachedEditorTabDocument: (tabId: string) => CachedEditorDocument | null
  hasCachedEditorDocument: (path: string) => boolean
  ensureCachedEditorTabDocument: (tabId: string, file: FileResult) => CachedEditorDocument
  markCachedEditorDocumentClean: (path: string, revision: number) => boolean
  markCachedEditorDocumentSaved: (input: {
    fileVersion: string
    path: string
    revision: number
    savedContentRevision: string
    savedText: string
  }) => boolean
  recordCachedEditorDocumentTextChange: (
    path: string,
    options?: {
      source?: 'canonical'
      sourceTabId?: string
      text?: string
      change?: DocumentSessionChange
      edits?: readonly TextEdit[]
    },
  ) => void
  renameCachedEditorDocumentPath: (
    from: string,
    to: string,
    options?: { bumpVersion?: boolean },
  ) => { wasDirty: boolean }
  setCachedEditorDocumentDirty: (path: string, dirty: boolean) => void
  setCachedEditorDocumentScrollPosition: (
    path: string,
    scrollPosition: EditorScrollPosition,
  ) => void
  setCachedEditorTabDocumentScrollPosition: (
    tabId: string,
    scrollPosition: EditorScrollPosition,
  ) => void
  setFallbackDocumentPath: (path: string | null) => void
}

export type EditorDocumentStore = EditorDocumentStoreState & EditorDocumentStoreActions

export type EditorDocumentStoreApi = StoreApi<EditorDocumentStore>

export const EditorDocumentStateContext = createContext<EditorDocumentStoreApi | null>(null)

export function useEditorDocumentStoreApi() {
  const store = use(EditorDocumentStateContext)
  if (!store) {
    throw clientErrors.CONTEXT_MISSING({
      message: 'useEditorDocumentStoreApi must be used within EditorStateProvider',
    })
  }

  return store
}

export function useEditorDocumentState<T>(selector: (state: EditorDocumentStore) => T): T {
  return useStore(useEditorDocumentStoreApi(), selector)
}

export function createEditorDocumentStore() {
  const service = new WorkspaceDocumentService()
  const initialDocuments = service.state()

  return createStore<EditorDocumentStore>()((set, get) => ({
    ...initialDocuments,
    fallbackDocumentPath: null,
    clearCachedEditorDocuments: () => {
      service.clear()
      set({ ...service.state(), fallbackDocumentPath: null })
    },
    deleteCachedEditorDocument: (path) => {
      const result = service.deleteDocument(path)
      set({ ...service.state() })
      return result
    },
    ensureCachedEditorDocument: (file, selectedFilePath = null) => {
      service.ensureDocument(file)
      set((state) => ({
        ...service.state(),
        fallbackDocumentPath:
          selectedFilePath === file.path ? file.path : state.fallbackDocumentPath,
      }))
      return get().documents[file.path]!
    },
    ensureCachedEditorTabDocument: (tabId, file) => {
      service.ensureTabDocument(tabId, file)
      set({ ...service.state() })
      return get().tabDocuments[tabId]!
    },
    evictCleanCachedEditorDocument: (path) => {
      const evicted = service.evictCleanDocument(path)
      if (evicted) set({ ...service.state() })
      return evicted
    },
    evictCleanCachedEditorTabDocument: (tabId) => {
      const evicted = service.evictCleanTabDocument(tabId)
      if (evicted) set({ ...service.state() })
      return evicted
    },
    forceReplaceCachedEditorDocument: (file, selectedFilePath = null) => {
      const result = service.forceReplaceDocument(file)
      if (result.changed || selectedFilePath === file.path) {
        set((state) => ({
          ...service.state(),
          fallbackDocumentPath:
            selectedFilePath === file.path ? file.path : state.fallbackDocumentPath,
        }))
      }
      return result
    },
    getCachedEditorDocument: (path) => get().documents[path] ?? null,
    getCachedEditorTabDocument: (tabId) => get().tabDocuments[tabId] ?? null,
    hasCachedEditorDocument: (path) => service.hasDocument(path),
    markCachedEditorDocumentClean: (path, revision) => {
      const marked = service.markClean(path, revision)
      if (marked) set({ ...service.state() })
      return marked
    },
    markCachedEditorDocumentSaved: (input) => {
      const marked = service.markSaved(input)
      set({ ...service.state() })
      return marked
    },
    recordCachedEditorDocumentTextChange: (path) => {
      service.recordTextChange(path)
      set({ ...service.state() })
    },
    renameCachedEditorDocumentPath: (from, to) => {
      const result = service.renameDocument(from, to)
      set((state) => ({
        ...service.state(),
        fallbackDocumentPath: state.fallbackDocumentPath === from ? to : state.fallbackDocumentPath,
      }))
      return result
    },
    setCachedEditorDocumentDirty: (path, dirty) => {
      service.setDirty(path, dirty)
      set({ ...service.state() })
    },
    setCachedEditorDocumentScrollPosition: (path, scrollPosition) => {
      const changed = service.setDocumentScrollPosition(path, scrollPosition)
      if (changed) set({ ...service.state() })
    },
    setCachedEditorTabDocumentScrollPosition: (tabId, scrollPosition) => {
      const changed = service.setTabScrollPosition(tabId, scrollPosition)
      if (changed) set({ ...service.state() })
    },
    setFallbackDocumentPath: (fallbackDocumentPath) => set({ fallbackDocumentPath }),
  }))
}
