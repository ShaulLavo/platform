import { useEffect } from 'react'

import { useEditorDocumentState } from '@/features/editor/state/document-state'

import { useSettings } from './use-settings'
import { parseSettingsJsonDocumentId } from '../utils/json-document'

/**
 * Seeds and attaches the buffer behind a raw settings.json tab.
 *
 * The text comes from the settings snapshot rather than a second `GET
 * /settings/raw`: the snapshot already carries each layer's bytes and the
 * revision they hash to, so the buffer and the page cannot disagree about which
 * version of the file they are looking at. A separate fetch could land either
 * side of another window's save and seed a document that never existed.
 *
 * Seeded once. Re-seeding on every snapshot would throw away whatever the user
 * has typed each time anything anywhere changed a setting — including the save
 * of this very buffer, whose own broadcast comes back through here.
 */
export function useSettingsJsonDocument(tabId: string, path: string) {
  const target = parseSettingsJsonDocumentId(path)
  const settings = useSettings()
  const file = target ? settings.data?.layers.find((layer) => layer.id === target)?.file : undefined
  const ensureUnsyncedEditorDocument = useEditorDocumentState(
    (state) => state.ensureUnsyncedEditorDocument,
  )
  const ensureEditorViewForDocument = useEditorDocumentState(
    (state) => state.ensureEditorViewForDocument,
  )
  const hasDocument = useEditorDocumentState((state) => Boolean(state.liveDocumentsById[path]))

  useEffect(() => {
    if (!target || !file) return
    if (hasDocument) return

    ensureUnsyncedEditorDocument({
      content: file.text,
      id: path,
      sync: { kind: 'settings', revision: file.revision, state: 'idle', target },
    })
  }, [ensureUnsyncedEditorDocument, file, hasDocument, path, target])

  // Separate from the seed: the view is per tab and the document is per layer, so
  // a second tab on the same layer attaches to a document that already exists.
  useEffect(() => {
    if (!target || !hasDocument) return

    ensureEditorViewForDocument(tabId, path)
  }, [ensureEditorViewForDocument, hasDocument, path, tabId, target])
}
