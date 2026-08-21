import { parseConflictDiffDocumentId } from '@/features/editor/utils/conflict-diff-document'
import { diffDocumentLabel, parseDiffDocumentId } from '@/features/git/utils/diff-document'
import {
  parseSearchBufferDocumentId,
  searchBufferDocumentLabel,
} from '@/features/search/utils/buffer-document'
import {
  compareSavedDocumentLabel,
  parseCompareSavedDocumentId,
} from '@/features/editor/utils/compare-saved-document'
import { parseRefDocumentId, refDocumentLabel } from '@/features/git/utils/ref-document'
import {
  parseSettingsJsonDocumentId,
  settingsJsonDocumentLabel,
} from '@/features/settings/utils/json-document'
import { basename } from '@/lib/path-formatters'

/**
 * Every surface that names an open document goes through here. Synthetic
 * document ids (`git-diff:`, `search-buffer:`, `conflict-diff:`) are opaque
 * encoded blobs, so anything that reaches for the last path segment instead
 * renders the raw id — which is what the window title used to do.
 *
 * Callers holding the conflict map resolve the conflict's real path first and
 * pass that in; this fallback only knows that the document is a conflict.
 */
export function documentLabel(path: string) {
  if (parseDiffDocumentId(path)) return diffDocumentLabel(path)
  if (parseSearchBufferDocumentId(path)) return searchBufferDocumentLabel()
  if (parseConflictDiffDocumentId(path)) return 'Conflict'
  if (parseCompareSavedDocumentId(path)) return compareSavedDocumentLabel(path)
  if (parseRefDocumentId(path)) return refDocumentLabel(path)
  if (parseSettingsJsonDocumentId(path)) return settingsJsonDocumentLabel(path)

  return basename(path)
}
