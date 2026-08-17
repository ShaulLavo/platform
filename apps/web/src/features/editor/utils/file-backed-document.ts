import { parseConflictDiffDocumentId } from '@/features/editor/utils/conflict-diff-document'
import { parseDiffDocumentId } from '@/features/git/utils/diff-document'
import { parseSearchBufferDocumentId } from '@/features/search/utils/buffer-document'
import { parseCompareSavedDocumentId } from '@/features/editor/utils/compare-saved-document'
import { parseRefDocumentId } from '@/features/git/utils/ref-document'

export function fileBackedDocumentPath(path: string | null | undefined) {
  if (!path) return null
  if (parseDiffDocumentId(path)) return null
  if (parseConflictDiffDocumentId(path)) return null
  if (parseSearchBufferDocumentId(path)) return null
  if (parseCompareSavedDocumentId(path)) return null
  if (parseRefDocumentId(path)) return null

  return path
}
