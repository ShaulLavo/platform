import { useEffect } from 'react'

import { useEditorDocumentState } from '@/features/editor/state/document-state'
import { useSettingsDocument } from '@/features/settings/hooks/use-settings-document'
import { useSettingsScope } from '@/features/settings/state/scope-store'
import { useSettingsView } from '@/features/settings/state/view-store'
import { isSettingsDocumentId } from '@/features/settings/utils/document'
import { settingsJsonDocumentId } from '@/features/settings/utils/json-document'

/**
 * Seeds and attaches the buffer behind the settings tab's JSON view.
 *
 * Lives at the tab body rather than in the view component so the tab's existing
 * document plumbing does the rest: attaching a view by document id is what makes
 * `viewsByTabId` resolve to this buffer, and the tab body already joins that into
 * a render document. Deriving one inside the view instead meant calling
 * `getEditorViewDocument` in a selector, which builds a fresh object per read and
 * never settles.
 *
 * One buffer per scope: switching the scope tab has to show the other file
 * without discarding what was typed in this one.
 *
 * The text comes from the settings snapshot rather than a second
 * `GET /settings/raw` — the snapshot already carries each layer's bytes and the
 * revision they hash to, so the buffer and the page cannot disagree about which
 * version they are looking at.
 */
export function useSettingsJsonDocument(tabId: string, tabPath: string) {
  const scope = useSettingsScope()
  const view = useSettingsView()
  const settings = useSettingsDocument()
  const active = isSettingsDocumentId(tabPath) && view === 'json'
  const documentId = active ? settingsJsonDocumentId(scope) : null
  const file = active ? settings.data?.layers.find((layer) => layer.id === scope)?.file : undefined
  const ensureUnsyncedEditorDocument = useEditorDocumentState(
    (state) => state.ensureUnsyncedEditorDocument,
  )
  const ensureEditorViewForDocument = useEditorDocumentState(
    (state) => state.ensureEditorViewForDocument,
  )
  const reconcileSettingsDocument = useEditorDocumentState(
    (state) => state.reconcileSettingsDocument,
  )
  // A boolean, not the document: a selector that builds a value re-runs forever.
  const hasDocument = useEditorDocumentState((state) =>
    documentId ? Boolean(state.liveDocumentsById[documentId]) : false,
  )

  // Seeded once per scope. Re-seeding on every snapshot would discard whatever
  // the user has typed each time anything changed a setting — including the
  // save of this very buffer, whose own broadcast comes back through here.
  useEffect(() => {
    if (!documentId || !file || hasDocument) return

    ensureUnsyncedEditorDocument({
      content: file.text,
      id: documentId,
      sync: { kind: 'settings', revision: file.revision, state: 'idle', target: scope },
    })
  }, [documentId, ensureUnsyncedEditorDocument, file, hasDocument, scope])

  // The other half of seeding once: a buffer that already exists has to follow
  // the file. Documents outlive their tabs and the same layer is written by the
  // form, by other windows and by hand, so without this the buffer would show
  // stale bytes and guard its save on a revision the server has moved past —
  // which refuses every save from then on. No-ops while the buffer is dirty.
  useEffect(() => {
    if (!documentId || !hasDocument || !file) return

    reconcileSettingsDocument(documentId, file.text, file.revision)
  }, [documentId, file, hasDocument, reconcileSettingsDocument])

  // Separate from the seed: the view is per tab, the document is per scope, so
  // switching scope rebinds this tab to a buffer that may already exist.
  useEffect(() => {
    if (!documentId || !hasDocument) return

    ensureEditorViewForDocument(tabId, documentId)
  }, [documentId, ensureEditorViewForDocument, hasDocument, tabId])
}
