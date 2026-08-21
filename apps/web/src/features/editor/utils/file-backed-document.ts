import { COMPARE_SAVED_PREFIX } from '@/features/editor/utils/compare-saved-document'
import { CONFLICT_DIFF_DOCUMENT_PREFIX } from '@/features/editor/utils/conflict-diff-document'
import { DIFF_DOCUMENT_PREFIX } from '@/features/git/utils/diff-document'
import { REF_DOCUMENT_PREFIX } from '@/features/git/utils/ref-document'
import { SEARCH_BUFFER_DOCUMENT_PREFIX } from '@/features/search/utils/buffer-document'
import { isSettingsDocumentId } from '@/features/settings/utils/document'
import { SETTINGS_JSON_DOCUMENT_PREFIX } from '@/features/settings/utils/json-document'

/**
 * Is this document id a real path on disk — something that can be saved, reverted or diffed
 * against HEAD?
 *
 * Matched on the prefix rather than by running each scheme's parser. Every synthetic id is
 * identified by its prefix alone, so the payload never changes the answer, and prefix matching is
 * the stricter reading of a malformed one: `git-diff:` with an undecodable body is still not a
 * file, where `parseDiffDocumentId` returns null for it and the caller then reports it as one.
 * Skipping the `decodeURIComponent` and `JSON.parse` per call is the smaller reason, but this is
 * asked once per command per render by the palette.
 */
export function fileBackedDocumentPath(path: string | null | undefined) {
  if (!path) return null
  if (isSettingsDocumentId(path)) return null
  if (path.startsWith(SETTINGS_JSON_DOCUMENT_PREFIX)) return null
  if (path.startsWith(DIFF_DOCUMENT_PREFIX)) return null
  if (path.startsWith(CONFLICT_DIFF_DOCUMENT_PREFIX)) return null
  if (path.startsWith(SEARCH_BUFFER_DOCUMENT_PREFIX)) return null
  if (path.startsWith(COMPARE_SAVED_PREFIX)) return null
  if (path.startsWith(REF_DOCUMENT_PREFIX)) return null

  return path
}

/**
 * Is this document id a surface an `editor.*` command can act on?
 *
 * A superset of the file-backed ids, because "has a text editor in it" and "is a file on disk" are
 * different questions: a conflict tab and a git-ref tab both own an unsynced document and attach a
 * view by document id rather than by file path (`EditorSurfaceTabBody`), so they take every editor
 * command while being unsavable.
 *
 * Diff ids are deliberately *not* here even though a diff is drawn by real `Editor`s now. Those
 * panes call `useEditor` directly and never register with `setActiveEditorCommandDispatch`, so
 * `dispatchEditorCommand` has nothing to reach on a diff tab — enabling the commands there would
 * advertise a no-op. The same holds for a search-results buffer, with a wrinkle: its surface does
 * register a dispatch, but only while a result row is focused, which is state no document id can
 * report. It stays out rather than flickering between honest and wrong.
 */
export function editorBackedDocumentPath(path: string | null | undefined) {
  if (!path) return null
  if (path.startsWith(CONFLICT_DIFF_DOCUMENT_PREFIX)) return path
  if (path.startsWith(REF_DOCUMENT_PREFIX)) return path
  if (path.startsWith(SETTINGS_JSON_DOCUMENT_PREFIX)) return path
  // The settings tab holds a real editor whenever its JSON view is showing. The
  // id cannot say which view that is, so it answers yes and the commands are a
  // no-op over the form — the same thing VS Code's settings tab does.
  if (isSettingsDocumentId(path)) return path

  return fileBackedDocumentPath(path)
}

/**
 * Is this document id something a save can be written back to?
 *
 * Wider than file-backed and narrower than editor-backed. A raw settings.json
 * buffer is written through `POST /settings/raw` rather than the fs routes, so it
 * takes a save while having no path on disk; a conflict or git-ref buffer is a
 * live editor with nowhere to put the bytes.
 *
 * This is the enablement-side approximation of the question `save.ts` asks of the
 * document itself. It has to be answerable from the id alone because the palette
 * and the menus only know which tab is selected, not what is loaded in it.
 */
export function savableDocumentPath(path: string | null | undefined) {
  if (!path) return null
  if (path.startsWith(SETTINGS_JSON_DOCUMENT_PREFIX)) return path
  if (isSettingsDocumentId(path)) return path

  return fileBackedDocumentPath(path)
}
