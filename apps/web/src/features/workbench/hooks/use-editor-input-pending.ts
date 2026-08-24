import { useIsFetching, type QueryKey } from '@tanstack/react-query'

import { parseCompareSavedDocumentId } from '@/features/editor/utils/compare-saved-document'
import { fileBackedDocumentPath } from '@/features/editor/utils/file-backed-document'
import { parseDiffDocumentId } from '@/features/git/utils/diff-document'
import { diffDocumentQueryKey } from '@/features/git/utils/diff-document-query'
import { queryHasNoData } from '@/lib/query-state'
import { fileSystemKeys } from '@/lib/query-keys'

const DISABLED_EDITOR_INPUT_QUERY = ['editor-input', 'disabled'] as const

export function useEditorInputPending(path: string | null | undefined): boolean {
  const queryKey = editorInputQueryKey(path) ?? DISABLED_EDITOR_INPUT_QUERY
  const unresolvedFetches = useIsFetching({ exact: true, predicate: queryHasNoData, queryKey })

  return queryKey !== DISABLED_EDITOR_INPUT_QUERY && unresolvedFetches > 0
}

export function editorInputQueryKey(path: string | null | undefined): QueryKey | null {
  const diff = parseDiffDocumentId(path)
  if (diff) return diffDocumentQueryKey(diff)

  const comparePath = parseCompareSavedDocumentId(path)
  if (comparePath) return fileSystemKeys.fileSnapshot(comparePath)

  const filePath = fileBackedDocumentPath(path)
  if (!filePath) return null

  return fileSystemKeys.fileSnapshot(filePath)
}
