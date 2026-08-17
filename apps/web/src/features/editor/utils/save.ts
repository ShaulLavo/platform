import { parseConflictDiffDocumentId } from '@/features/editor/utils/conflict-diff-document'
import {
  type EditorDocumentStore,
  type EditorDocumentStoreApi,
  type LiveEditorDocument,
} from '@/features/editor/state/document-state'
import { parseDiffDocumentId } from '@/features/git/utils/diff-document'
import { parseSearchBufferDocumentId } from '@/features/search/utils/buffer-document'
import { parseCompareSavedDocumentId } from '@/features/editor/utils/compare-saved-document'
import { parseRefDocumentId } from '@/features/git/utils/ref-document'
import { FileSyncService } from '@/features/editor/state/file-sync-service'
import type { QueryClient } from '@tanstack/react-query'

export async function saveSelectedEditorDocument(
  documentStore: EditorDocumentStoreApi,
  queryClient: QueryClient,
  selectedFilePath: string | null,
) {
  const path = fileBackedEditorPath(selectedFilePath)
  if (!path) return false

  return saveEditorDocumentByPath(documentStore, queryClient, path)
}

export async function saveEditorDocumentByPath(
  documentStore: EditorDocumentStoreApi,
  queryClient: QueryClient,
  path: string,
) {
  if (!fileBackedEditorPath(path)) return false

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

export function fileBackedEditorPath(path: string | null | undefined) {
  if (!path) return null
  if (parseDiffDocumentId(path)) return null
  if (parseConflictDiffDocumentId(path)) return null
  if (parseSearchBufferDocumentId(path)) return null
  if (parseCompareSavedDocumentId(path)) return null
  if (parseRefDocumentId(path)) return null

  return path
}

function shouldSaveDocument(
  state: Pick<EditorDocumentStore, 'dirtyFilePaths' | 'liveDocumentsById'>,
  document: LiveEditorDocument,
) {
  if (document.sync.kind !== 'file') return false
  if (!fileBackedEditorPath(document.sync.path)) return false

  return isDirtyLiveEditorDocument(state, document.sync.path)
}
