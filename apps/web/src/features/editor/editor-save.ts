import { parseConflictDiffDocumentId } from '@/features/editor/conflict-diff-document'
import {
  type CachedEditorDocument,
  type EditorDocumentStore,
  type EditorDocumentStoreApi,
} from '@/features/editor/state/editor-document-state'
import { parseDiffDocumentId } from '@/features/git/diff-document'
import { parseSearchBufferDocumentId } from '@/features/search/search-buffer-document'
import { setFileContentQueryData } from '@/lib/file-query-cache'
import { writeFileContent } from '@/lib/file-server'
import type { FileResult } from '@/lib/file-system-types'
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
  const document = state.getCachedEditorDocument(path)
  if (!document) return false
  if (!isDirtyCachedEditorDocument(state, path)) return true

  await saveCachedEditorDocument(documentStore, queryClient, document)
  return true
}

export async function saveAllEditorDocuments(
  documentStore: EditorDocumentStoreApi,
  queryClient: QueryClient,
) {
  const state = documentStore.getState()
  const dirtyDocuments = Object.values(state.documents).filter((document) =>
    shouldSaveDocument(state, document),
  )

  for (const document of dirtyDocuments) {
    await saveCachedEditorDocument(documentStore, queryClient, document)
  }
}

export async function saveCachedEditorDocument(
  documentStore: EditorDocumentStoreApi,
  queryClient: QueryClient,
  document: CachedEditorDocument,
) {
  const content = document.session.materializeFullText()
  const entry = await writeFileContent(document.path, content, document.revision)
  const file = fileResultForSavedDocument(document.path, content, entry)
  documentStore.getState().markCachedEditorDocumentClean(document.path, entry.mtimeMs)
  setFileContentQueryData(queryClient, file)
}

export function isDirtyCachedEditorDocument(
  state: Pick<EditorDocumentStore, 'dirtyFilePaths' | 'documents'>,
  path: string,
) {
  return state.dirtyFilePaths.has(path) || state.documents[path]?.session.isDirty() === true
}

export function fileBackedEditorPath(path: string | null | undefined) {
  if (!path) return null
  if (parseDiffDocumentId(path)) return null
  if (parseConflictDiffDocumentId(path)) return null
  if (parseSearchBufferDocumentId(path)) return null

  return path
}

function shouldSaveDocument(
  state: Pick<EditorDocumentStore, 'dirtyFilePaths' | 'documents'>,
  document: CachedEditorDocument,
) {
  if (!fileBackedEditorPath(document.path)) return false

  return isDirtyCachedEditorDocument(state, document.path)
}

function fileResultForSavedDocument(
  path: string,
  content: string,
  entry: { readonly mtimeMs: number; readonly size: number },
): FileResult {
  return {
    content,
    mtimeMs: entry.mtimeMs,
    path,
    size: entry.size,
  }
}
