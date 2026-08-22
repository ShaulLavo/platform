import {
  type EditorDocumentStore,
  type EditorDocumentStoreApi,
  type LiveEditorDocument,
} from '@/features/editor/state/document-state'
import { FileSyncService } from '@/features/editor/state/file-sync-service'
import { SettingsSyncService } from '@/features/settings/state/sync-service'
import type { QueryClient } from '@tanstack/react-query'

/**
 * Whether this document has somewhere to be written back to.
 *
 * Asked of the document rather than of its id. "Is this a path on disk" is a
 * narrower question that used to stand in for this one, and it was wrong in both
 * directions: a raw settings buffer is savable without being a file, and the
 * check had to be restated at every entry point to keep a diff document out.
 * A document that was never seeded from something writable carries
 * `sync.kind === 'none'` and answers no here once.
 */
function savableDocument(document: LiveEditorDocument) {
  return document.sync.kind !== 'none'
}

export async function saveSelectedEditorDocument(
  documentStore: EditorDocumentStoreApi,
  queryClient: QueryClient,
  selectedFilePath: string | null,
) {
  if (!selectedFilePath) return false

  return saveEditorDocumentByPath(documentStore, queryClient, selectedFilePath)
}

export async function saveEditorDocumentByPath(
  documentStore: EditorDocumentStoreApi,
  queryClient: QueryClient,
  path: string,
) {
  const state = documentStore.getState()
  const liveDocument = state.getLiveEditorDocument(path)
  if (!liveDocument) return false
  if (!savableDocument(liveDocument)) return false
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

  // Each document on its own: a save that refuses itself — a settings buffer
  // whose file moved, a file another window is holding — must not take every
  // document ordered after it with it. The first failure is still reported, so
  // the command surfaces an error rather than claiming it saved everything.
  const failures: unknown[] = []
  for (const document of dirtyDocuments) {
    try {
      await saveLiveEditorDocument(documentStore, queryClient, document)
    } catch (error) {
      failures.push(error)
    }
  }

  if (failures.length > 0) throw failures[0]
}

async function saveLiveEditorDocument(
  documentStore: EditorDocumentStoreApi,
  queryClient: QueryClient,
  document: LiveEditorDocument,
) {
  if (document.sync.kind === 'settings') {
    await new SettingsSyncService(documentStore, queryClient).save(document)
    return
  }

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
  if (!savableDocument(document)) return false

  return isDirtyLiveEditorDocument(state, document.id)
}
