import { clientErrors } from '@/lib/structured-errors'
import type { FileResult } from '@/lib/file-system-types'
import { type EditorScrollPosition } from '@singapor/core'
import { createContext, use } from 'react'
import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'
import {
  WorkspaceDocumentService,
  type EditorDocumentView,
  type LiveEditorDocument,
  type LiveEditorViewDocument,
  type UnsyncedLiveEditorDocumentInput,
} from '@/features/editor/state/workspace-document-service'

export type {
  EditorDocumentView,
  LiveEditorDocument,
  LiveEditorViewDocument,
  UnsyncedLiveEditorDocumentInput,
}

export type DeleteLiveEditorDocumentResult = {
  hadLiveDocument: boolean
  wasDirty: boolean
}

type EditorDocumentStoreState = {
  documentContentRevisions: Readonly<Record<string, string>>
  dirtyContentRevision: number
  dirtyFilePaths: ReadonlySet<string>
  fallbackDocumentPath: string | null
  liveDocumentsById: Readonly<Record<string, LiveEditorDocument>>
  scrollPositionByTabId: Readonly<Record<string, EditorScrollPosition>>
  viewsByTabId: Readonly<Record<string, EditorDocumentView>>
}

type EditorDocumentStoreActions = {
  clearLiveEditorDocuments: () => void
  deleteLiveEditorDocument: (documentId: string) => DeleteLiveEditorDocumentResult
  ensureEditorView: (tabId: string, file: FileResult) => LiveEditorViewDocument
  ensureEditorViewForDocument: (tabId: string, documentId: string) => LiveEditorViewDocument
  ensureLiveEditorDocument: (
    file: FileResult,
    selectedFilePath?: string | null,
  ) => LiveEditorDocument
  ensureUnsyncedEditorDocument: (input: UnsyncedLiveEditorDocumentInput) => LiveEditorDocument
  evictCleanLiveEditorDocument: (documentId: string) => boolean
  evictCleanUnviewedLiveEditorDocument: (documentId: string) => boolean
  forceReplaceLiveEditorDocument: (
    file: FileResult,
    selectedFilePath?: string | null,
  ) => { wasDirty: boolean }
  getEditorView: (tabId: string) => EditorDocumentView | null
  getEditorViewDocument: (tabId: string) => LiveEditorViewDocument | null
  getLiveEditorDocument: (documentId: string) => LiveEditorDocument | null
  hasLiveEditorDocument: (documentId: string) => boolean
  markLiveEditorDocumentSaved: (input: {
    documentId: string
    fileVersion: string
    mtimeMs: number
    savedContentRevision: string
    savedText: string
  }) => boolean
  recordLiveEditorDocumentTextChange: (documentId: string) => void
  removeEditorView: (tabId: string) => boolean
  renameLiveEditorDocumentPath: (from: string, to: string) => { wasDirty: boolean }
  setEditorViewScrollPosition: (tabId: string, scrollPosition: EditorScrollPosition) => void
  setFallbackDocumentPath: (path: string | null) => void
  setLiveEditorDocumentDirty: (documentId: string, dirty: boolean) => void
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
    clearLiveEditorDocuments: () => {
      service.clear()
      set({ ...service.state(), fallbackDocumentPath: null })
    },
    deleteLiveEditorDocument: (documentId) => {
      const result = service.deleteLiveDocument(documentId)
      set({ ...service.state() })
      return result
    },
    ensureEditorView: (tabId, file) => {
      service.ensureView(tabId, file)
      set({ ...service.state() })
      return get().getEditorViewDocument(tabId)!
    },
    ensureEditorViewForDocument: (tabId, documentId) => {
      service.ensureViewForDocument(tabId, documentId)
      set({ ...service.state() })
      return get().getEditorViewDocument(tabId)!
    },
    ensureLiveEditorDocument: (file, selectedFilePath = null) => {
      service.ensureLiveDocument(file)
      set((state) => ({
        ...service.state(),
        fallbackDocumentPath:
          selectedFilePath === file.path ? file.path : state.fallbackDocumentPath,
      }))
      return get().liveDocumentsById[file.path]!
    },
    ensureUnsyncedEditorDocument: (input) => {
      service.ensureUnsyncedDocument(input)
      set({ ...service.state() })
      return get().liveDocumentsById[input.id]!
    },
    evictCleanLiveEditorDocument: (documentId) => {
      const evicted = service.evictCleanLiveDocument(documentId)
      if (evicted) set({ ...service.state() })
      return evicted
    },
    evictCleanUnviewedLiveEditorDocument: (documentId) => {
      const evicted = service.evictCleanUnviewedLiveDocument(documentId)
      if (evicted) set({ ...service.state() })
      return evicted
    },
    forceReplaceLiveEditorDocument: (file, selectedFilePath = null) => {
      const result = service.forceReplaceLiveDocument(file)
      if (result.changed || selectedFilePath === file.path) {
        set((state) => ({
          ...service.state(),
          fallbackDocumentPath:
            selectedFilePath === file.path ? file.path : state.fallbackDocumentPath,
        }))
      }
      return { wasDirty: result.wasDirty }
    },
    getEditorView: (tabId) => get().viewsByTabId[tabId] ?? null,
    getEditorViewDocument: (tabId) => {
      const view = get().viewsByTabId[tabId]
      if (!view) return null

      const document = get().liveDocumentsById[view.documentId]
      if (!document) return null

      return {
        ...document,
        scrollPosition: view.scrollPosition,
        tabId,
        view: view.view,
      }
    },
    getLiveEditorDocument: (documentId) => get().liveDocumentsById[documentId] ?? null,
    hasLiveEditorDocument: (documentId) => service.hasLiveDocument(documentId),
    markLiveEditorDocumentSaved: (input) => {
      const marked = service.markSaved(input)
      set({ ...service.state() })
      return marked
    },
    recordLiveEditorDocumentTextChange: (documentId) => {
      service.recordTextChange(documentId)
      set({ ...service.state() })
    },
    removeEditorView: (tabId) => {
      const removed = service.removeView(tabId)
      if (removed) set({ ...service.state() })
      return removed
    },
    renameLiveEditorDocumentPath: (from, to) => {
      const result = service.renameLiveDocument(from, to)
      set((state) => ({
        ...service.state(),
        fallbackDocumentPath: state.fallbackDocumentPath === from ? to : state.fallbackDocumentPath,
      }))
      return result
    },
    setEditorViewScrollPosition: (tabId, scrollPosition) => {
      const changed = service.setViewScrollPosition(tabId, scrollPosition)
      if (changed) set({ ...service.state() })
    },
    setFallbackDocumentPath: (fallbackDocumentPath) => set({ fallbackDocumentPath }),
    setLiveEditorDocumentDirty: (documentId, dirty) => {
      service.setDirty(documentId, dirty)
      set({ ...service.state() })
    },
  }))
}
