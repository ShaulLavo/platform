import { clientErrors } from '@/lib/structured-errors'
import type { FileResult } from '@/lib/file-system-types'
import { type EditorScrollPosition } from '@singapor/core'
import { createContext, use } from 'react'
import { useStore } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { createStore, type Mutate, type StoreApi } from 'zustand/vanilla'
import type { DocumentRetention } from '@/features/editor/utils/document-retention'
import {
  WorkspaceDocumentService,
  type EditorDocumentView,
  type LiveEditorDocument,
  type LiveEditorViewDocument,
  type UnsyncedLiveEditorDocumentInput,
} from '@/features/editor/state/workspace-document-service'

export type { LiveEditorDocument, UnsyncedLiveEditorDocumentInput }

type DeleteLiveEditorDocumentResult = {
  hadLiveDocument: boolean
  wasDirty: boolean
}

type CreateEditorDocumentStoreOptions = {
  /** Scroll positions restored from the workspace cache, keyed by document path. */
  scrollPositionSeeds?: Readonly<Record<string, EditorScrollPosition>>
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
  deleteLiveEditorDocument: (documentId: string) => DeleteLiveEditorDocumentResult
  ensureEditorView: (tabId: string, file: FileResult) => LiveEditorViewDocument
  ensureEditorViewForDocument: (tabId: string, documentId: string) => LiveEditorViewDocument
  ensureLiveEditorDocument: (
    file: FileResult,
    selectedFilePath?: string | null,
  ) => LiveEditorDocument
  ensureUnsyncedEditorDocument: (input: UnsyncedLiveEditorDocumentInput) => LiveEditorDocument
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
  markSettingsDocumentSaved: (input: {
    documentId: string
    revision: string
    savedContentRevision: string
    savedText: string
  }) => boolean
  /** Re-seeds a synthetic buffer from text the server rewrote; see the service. */
  replaceUnsyncedEditorDocumentText: (documentId: string, text: string) => boolean
  /** Brings a clean settings buffer back in step with the file; see the service. */
  reconcileSettingsDocument: (documentId: string, text: string, revision: string) => boolean
  recordLiveEditorDocumentTextChange: (documentId: string) => void
  removeEditorView: (tabId: string) => boolean
  renameLiveEditorDocumentPath: (from: string, to: string) => { wasDirty: boolean }
  /** Replaces the scroll-restore seeds (e.g. after a workspace switch). Not reactive. */
  seedEditorScrollPositions: (byPath: Readonly<Record<string, EditorScrollPosition>>) => void
  /** The single eviction path: everything outside the keep sets is dropped. */
  retainEditorDocuments: (keep: DocumentRetention) => {
    evictedDocumentIds: string[]
    evictedTabIds: string[]
  }
  setEditorViewScrollPosition: (tabId: string, scrollPosition: EditorScrollPosition) => void
  setFallbackDocumentPath: (path: string | null) => void
  setLiveEditorDocumentDirty: (documentId: string, dirty: boolean) => void
}

export type EditorDocumentStore = EditorDocumentStoreState & EditorDocumentStoreActions

export type EditorDocumentStoreApi = Mutate<
  StoreApi<EditorDocumentStore>,
  [['zustand/subscribeWithSelector', never]]
>

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

export function createEditorDocumentStore(options: CreateEditorDocumentStoreOptions = {}) {
  const service = new WorkspaceDocumentService()
  if (options.scrollPositionSeeds) service.seedScrollPositions(options.scrollPositionSeeds)
  const initialDocuments = service.state()

  return createStore<EditorDocumentStore>()(
    subscribeWithSelector((set, get) => ({
      ...initialDocuments,
      fallbackDocumentPath: null,
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
      markSettingsDocumentSaved: (input) => {
        const marked = service.markSettingsSaved(input)
        set({ ...service.state() })
        return marked
      },
      replaceUnsyncedEditorDocumentText: (documentId, text) => {
        const replaced = service.replaceUnsyncedDocumentText(documentId, text)
        if (replaced) set({ ...service.state() })
        return replaced
      },
      reconcileSettingsDocument: (documentId, text, revision) => {
        const reconciled = service.reconcileSettingsDocument(documentId, text, revision)
        if (reconciled) set({ ...service.state() })
        return reconciled
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
          fallbackDocumentPath:
            state.fallbackDocumentPath === from ? to : state.fallbackDocumentPath,
        }))
        return result
      },
      retainEditorDocuments: (keep) => {
        const result = service.retain(keep)
        set((state) => ({
          ...service.state(),
          fallbackDocumentPath: result.evictedDocumentIds.includes(state.fallbackDocumentPath ?? '')
            ? null
            : state.fallbackDocumentPath,
        }))
        return result
      },
      setEditorViewScrollPosition: (tabId, scrollPosition) => {
        const changed = service.setViewScrollPosition(tabId, scrollPosition)
        // Runs at scroll rate; service.state() keeps unchanged slices
        // referentially stable, so this notify only re-renders subscribers of
        // the scroll position itself.
        if (changed) set({ ...service.state() })
      },
      setFallbackDocumentPath: (fallbackDocumentPath) => set({ fallbackDocumentPath }),
      seedEditorScrollPositions: (byPath) => service.seedScrollPositions(byPath),
      setLiveEditorDocumentDirty: (documentId, dirty) => {
        service.setDirty(documentId, dirty)
        set({ ...service.state() })
      },
    })),
  )
}
