import { isSettingsDocumentId } from '@/features/settings/utils/document'
import { SETTINGS_JSON_DOCUMENT_PREFIX } from '@/features/settings/utils/json-document'

/**
 * Whether a tab has unsaved text in it.
 *
 * Usually one tab is one document and this is a set lookup. The settings tab is
 * the exception: it is one tab over two documents, because the user and workspace
 * files are edited independently behind its scope tabs. So it is dirty when
 * either of them is — otherwise switching scope would hide the dot for the edit
 * you left behind, and closing the tab would discard it silently.
 */
export function isEditorTabDirty(path: string, dirtyPaths: ReadonlySet<string>) {
  if (dirtyPaths.has(path)) return true
  if (!isSettingsDocumentId(path)) return false

  for (const dirty of dirtyPaths) {
    if (dirty.startsWith(SETTINGS_JSON_DOCUMENT_PREFIX)) return true
  }

  return false
}
