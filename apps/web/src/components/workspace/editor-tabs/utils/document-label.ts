import { parseConflictDiffDocumentId } from '@/features/editor/conflict-diff-document'
import { diffDocumentLabel, parseDiffDocumentId } from '@/features/git/diff-document'
import {
  parseSearchBufferDocumentId,
  searchBufferDocumentLabel,
} from '@/features/search/search-buffer-document'
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

  return basename(path)
}
