import { parseConflictDiffDocumentId } from '@/features/editor/conflict-diff-document'
import { parseDiffDocumentId } from '@/features/git/diff-document'
import { parseSearchBufferDocumentId } from '@/features/search/search-buffer-document'
import { parseCompareSavedDocumentId } from '@/features/editor/compare-saved-document'

export function fileBackedDocumentPath(path: string | null | undefined) {
  if (!path) return null
  if (parseDiffDocumentId(path)) return null
  if (parseConflictDiffDocumentId(path)) return null
  if (parseSearchBufferDocumentId(path)) return null
  if (parseCompareSavedDocumentId(path)) return null

  return path
}
