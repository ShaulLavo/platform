import { isSettingsDocumentId } from '@/features/settings/utils/document'
import { SETTINGS_JSON_DOCUMENT_IDS } from '@/features/settings/utils/json-document'

/**
 * The documents whose text belongs to a tab.
 *
 * Usually one tab is one document and this is the path itself. The settings tab
 * is the exception: it is one tab over two documents, because the user and
 * workspace files are edited independently behind its scope tabs, and neither is
 * keyed by the tab's own path.
 *
 * Everything that asks "is this tab dirty", "what does closing it save" and
 * "what does discarding it throw away" has to ask it of these ids rather than of
 * `tab.path` — asking the tab path returns false for the settings tab always,
 * which is a tab that closes without a prompt and takes the edits with it.
 */
export function editorTabDocumentIds(path: string): readonly string[] {
  if (!isSettingsDocumentId(path)) return [path]

  return SETTINGS_JSON_DOCUMENT_IDS
}

/** Whether a tab has unsaved text in any of the documents behind it. */
export function isEditorTabDirty(path: string, dirtyPaths: ReadonlySet<string>) {
  return editorTabDocumentIds(path).some((id) => dirtyPaths.has(id))
}
