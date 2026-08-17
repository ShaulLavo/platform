import { useQueryClient } from '@tanstack/react-query'

import { fetchGitFile } from '@/features/git/utils/api'
import { refDocumentId } from '@/features/git/utils/ref-document'
import { useEditorCommands } from '@/features/editor/state/commands'
import { useEditorDocumentStoreApi } from '@/features/editor/state/document-state'
import { gitKeys } from '@/lib/query-keys'

/**
 * Opens a file as of a git ref in a read-only-by-construction tab.
 *
 * The content is loaded into an *unsynced* document: it has no path on disk, so the save path
 * refuses it and the file-backed guards exclude it. That is what makes it read-only — the editor
 * has no read-only flag, and a ref buffer must never be writable back onto the working tree.
 */
export function useOpenFileAtRef() {
  const queryClient = useQueryClient()
  const documentStore = useEditorDocumentStoreApi()
  const { selectFile } = useEditorCommands()

  return async function openFileAtRef(path: string, ref: string): Promise<boolean> {
    const documentId = refDocumentId({ path, ref })
    // Content-addressed by (path, ref), so reopening the tab reuses the cache instead of refetching.
    const file = await queryClient.fetchQuery({
      queryFn: ({ signal }) => fetchGitFile(path, ref, signal),
      queryKey: gitKeys.file(path, ref),
      staleTime: Infinity,
    })

    documentStore.getState().ensureUnsyncedEditorDocument({ content: file.content, id: documentId })
    selectFile(documentId)
    return true
  }
}
