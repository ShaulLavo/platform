import type { QueryClient } from '@tanstack/react-query'

import type {
  EditorDocumentStoreApi,
  LiveEditorDocument,
} from '@/features/editor/state/document-state'
import { createClientInvariantError } from '@/lib/structured-errors'

import { saveSettingsText } from '../utils/api'
import { settingsKeys } from '../utils/query-keys'

/**
 * Saves a raw settings.json buffer.
 *
 * In `state/` beside its sibling `FileSyncService`, not in `utils/`: it holds the
 * document store and the query client and writes through both.
 *
 * The sibling of `FileSyncService` for the one document that is editable text
 * without being a file: the fs routes take workspace-relative paths and the
 * settings file is addressed by layer, so this goes to `POST /settings/raw`.
 *
 * The response is the whole new snapshot, so this seeds the query cache with it
 * rather than invalidating — the write already returned the truth, and a refetch
 * could land either side of another window's save.
 */
export class SettingsSyncService {
  constructor(
    private readonly documentStore: EditorDocumentStoreApi,
    private readonly queryClient: QueryClient,
  ) {}

  async save(document: LiveEditorDocument): Promise<void> {
    if (document.sync.kind !== 'settings') {
      throw createClientInvariantError(`Cannot save ${document.id} as settings text`)
    }

    const sync = document.sync
    const posted = document.buffer.materializeFullText()
    const savedContentRevision = document.contentRevision
    const snapshot = await saveSettingsText({
      baseRevision: sync.revision,
      target: sync.target,
      text: posted,
    })
    this.queryClient.setQueryData(settingsKeys.document(), snapshot)

    // What is on disk, not what was posted: the server lifts provider
    // credentials out of the document into the secret store and rewrites that
    // subtree, so the two differ exactly when a secret was absorbed.
    const written = snapshot.layers.find((layer) => layer.id === sync.target)?.file
    const state = this.documentStore.getState()
    state.markSettingsDocumentSaved({
      documentId: document.id,
      revision: written?.revision ?? sync.revision,
      savedContentRevision,
      savedText: written?.text ?? posted,
    })
    if (written && written.text !== posted) {
      state.replaceUnsyncedEditorDocumentText(document.id, written.text)
    }
  }
}
