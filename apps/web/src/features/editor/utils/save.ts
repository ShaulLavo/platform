import {
  type EditorDocumentStore,
  type EditorDocumentStoreApi,
  type LiveEditorDocument,
} from '@/features/editor/state/document-state'
import { fileBackedDocumentPath } from '@/features/editor/utils/file-backed-document'
import { FileSyncService } from '@/features/editor/state/file-sync-service'
import type { QueryClient } from '@tanstack/react-query'

export async function saveSelectedEditorDocument(
  documentStore: EditorDocumentStoreApi,
  queryClient: QueryClient,
  selectedFilePath: string | null,
) {
  const path = fileBackedDocumentPath(selectedFilePath)
  if (!path) return false

  return saveEditorDocumentByPath(documentStore, queryClient, path)
}

export async function saveEditorDocumentByPath(
  documentStore: EditorDocumentStoreApi,
  queryClient: QueryClient,
  path: string,
) {
  if (!fileBackedDocumentPath(path)) return false

  const state = documentStore.getState()
  const liveDocument = state.getLiveEditorDocument(path)
  if (!liveDocument) return false
  if (!isDirtyLiveEditorDocument(state, path)) return true

  await saveLiveEditorDocument(documentStore, queryClient, liveDocument)
  return true
}

export async function saveAllEditorDocuments(
  documentStore: EditorDocumentStoreApi,
  queryClient: QueryClient,
) {
  const state = documentStore.getState()
  const dirtyDocuments = Object.values(state.liveDocumentsById).filter((liveDocument) =>
    shouldSaveDocument(state, liveDocument),
  )

  for (const document of dirtyDocuments) {
    await saveLiveEditorDocument(documentStore, queryClient, document)
  }
}

async function saveLiveEditorDocument(
  documentStore: EditorDocumentStoreApi,
  queryClient: QueryClient,
  document: LiveEditorDocument,
) {
  await new FileSyncService(documentStore, queryClient).save(document)
}

export function isDirtyLiveEditorDocument(
  state: Pick<EditorDocumentStore, 'dirtyFilePaths' | 'liveDocumentsById'>,
  path: string,
) {
  return state.dirtyFilePaths.has(path) || state.liveDocumentsById[path]?.buffer.isDirty() === true
}

function shouldSaveDocument(
  state: Pick<EditorDocumentStore, 'dirtyFilePaths' | 'liveDocumentsById'>,
  document: LiveEditorDocument,
) {
  if (document.sync.kind !== 'file') return false
  if (!fileBackedDocumentPath(document.sync.path)) return false

  return isDirtyLiveEditorDocument(state, document.sync.path)
}
