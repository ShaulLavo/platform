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
  type WorkspaceDocumentServiceState,
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

type EditorDocumentStoreActions = {
  deleteLiveEditorDocument: (documentId: string) => DeleteLiveEditorDocumentResult
  ensureEditorView: (tabId: string, file: FileResult) => LiveEditorViewDocument
  ensureEditorViewForDocument: (tabId: string, documentId: string) => LiveEditorViewDocument
  ensureLiveEditorDocument: (file: FileResult) => LiveEditorDocument
  ensureUnsyncedEditorDocument: (input: UnsyncedLiveEditorDocumentInput) => LiveEditorDocument
  forceReplaceLiveEditorDocument: (file: FileResult) => { wasDirty: boolean }
  getEditorView: (tabId: string) => EditorDocumentView | null
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
  setLiveEditorDocumentDirty: (documentId: string, dirty: boolean) => void
}

/**
 * The service owns every document fact; this store owns none. Its state type is
 * the service's state type — so a field can only ever be declared once — and
 * every action is "mutate the service, then publish its state". Reads go to the
 * service rather than to the published copy, which is the same object either
 * way: the service hands out the stored document, not a projection of it.
 */
export type EditorDocumentStore = WorkspaceDocumentServiceState & EditorDocumentStoreActions

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

/**
 * The same read, for a surface that works with or without live documents.
 *
 * A diff renders in the git panel, in a checkpoint, in a test — and only wants to know whether some
 * editor happens to hold a path open. Throwing at it for being mounted outside the editor's
 * provider would turn an optional capability into a hard dependency, so an absent provider reads
 * as "nothing is open" instead.
 */
export function useOptionalEditorDocumentState<T>(selector: (state: EditorDocumentStore) => T): T {
  return useStore(use(EditorDocumentStateContext) ?? NO_LIVE_DOCUMENTS, selector)
}

/** Enough of the store to be read from, and never anything to read. */
const EMPTY_DOCUMENT_STATE = {
  documentContentRevisions: {},
  liveDocumentsById: {},
} as unknown as EditorDocumentStore

const NO_LIVE_DOCUMENTS = {
  getInitialState: () => EMPTY_DOCUMENT_STATE,
  getState: () => EMPTY_DOCUMENT_STATE,
  setState: () => undefined,
  subscribe: () => () => undefined,
} as unknown as EditorDocumentStoreApi

export function createEditorDocumentStore(options: CreateEditorDocumentStoreOptions = {}) {
  const service = new WorkspaceDocumentService()
  if (options.scrollPositionSeeds) service.seedScrollPositions(options.scrollPositionSeeds)

  return createStore<EditorDocumentStore>()(
    subscribeWithSelector((set) => {
      const publish = () => set(service.state())

      return {
        ...service.state(),
        deleteLiveEditorDocument: (documentId) => {
          const result = service.deleteLiveDocument(documentId)
          publish()
          return result
        },
        ensureEditorView: (tabId, file) => {
          const viewDocument = service.ensureView(tabId, file)
          publish()
          return viewDocument
        },
        ensureEditorViewForDocument: (tabId, documentId) => {
          const viewDocument = service.ensureViewForDocument(tabId, documentId)
          publish()
          return viewDocument
        },
        ensureLiveEditorDocument: (file) => {
          const document = service.ensureLiveDocument(file)
          publish()
          return document
        },
        ensureUnsyncedEditorDocument: (input) => {
          const document = service.ensureUnsyncedDocument(input)
          publish()
          return document
        },
        forceReplaceLiveEditorDocument: (file) => {
          const result = service.forceReplaceLiveDocument(file)
          if (result.changed) publish()
          return { wasDirty: result.wasDirty }
        },
        getEditorView: (tabId) => service.getView(tabId),
        getLiveEditorDocument: (documentId) => service.getLiveDocument(documentId),
        hasLiveEditorDocument: (documentId) => service.hasLiveDocument(documentId),
        markLiveEditorDocumentSaved: (input) => {
          const marked = service.markSaved(input)
          publish()
          return marked
        },
        markSettingsDocumentSaved: (input) => {
          const marked = service.markSettingsSaved(input)
          publish()
          return marked
        },
        replaceUnsyncedEditorDocumentText: (documentId, text) => {
          const replaced = service.replaceUnsyncedDocumentText(documentId, text)
          if (replaced) publish()
          return replaced
        },
        reconcileSettingsDocument: (documentId, text, revision) => {
          const reconciled = service.reconcileSettingsDocument(documentId, text, revision)
          if (reconciled) publish()
          return reconciled
        },
        recordLiveEditorDocumentTextChange: (documentId) => {
          service.recordTextChange(documentId)
          publish()
        },
        removeEditorView: (tabId) => {
          const removed = service.removeView(tabId)
          if (removed) publish()
          return removed
        },
        renameLiveEditorDocumentPath: (from, to) => {
          const result = service.renameLiveDocument(from, to)
          publish()
          return result
        },
        retainEditorDocuments: (keep) => {
          const result = service.retain(keep)
          publish()
          return result
        },
        setEditorViewScrollPosition: (tabId, scrollPosition) => {
          const changed = service.setViewScrollPosition(tabId, scrollPosition)
          // Runs at scroll rate; service.state() keeps unchanged slices
          // referentially stable, so this notify only re-renders subscribers of
          // the scroll position itself.
          if (changed) publish()
        },
        seedEditorScrollPositions: (byPath) => service.seedScrollPositions(byPath),
        setLiveEditorDocumentDirty: (documentId, dirty) => {
          service.setDirty(documentId, dirty)
          publish()
        },
      }
    }),
  )
}
