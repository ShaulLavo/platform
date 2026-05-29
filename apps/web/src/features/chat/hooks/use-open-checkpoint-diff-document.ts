import { useQueryClient } from '@tanstack/react-query'

import { useEditorCommands } from '@/features/editor/state/editor-commands'
import { checkpointDiffDocumentId } from '@/features/git/diff-document'
import {
  canOpenCheckpointDiff,
  checkpointDiffDocumentInput,
  checkpointDiffInputForSummary,
  checkpointDiffQueryKey,
  fetchCheckpointDiff,
  matchingCheckpointDiff,
} from '../lib/checkpoint-diff-query'
import type { ChatTurnDiffSummary } from '../state/chat-projection-store'

export function useOpenCheckpointDiffDocument() {
  const queryClient = useQueryClient()
  const { selectFile } = useEditorCommands()

  async function openCheckpointDiff(summary: ChatTurnDiffSummary, path?: string) {
    if (!canOpenCheckpointDiff(summary)) return false

    const rangeInput = checkpointDiffInputForSummary(summary)
    const diffs = await queryClient.fetchQuery({
      queryFn: ({ signal }) => fetchCheckpointDiff(rangeInput, signal),
      queryKey: checkpointDiffQueryKey(rangeInput),
      staleTime: Infinity,
    })
    const diff = matchingCheckpointDiff(diffs, path) ?? diffs[0] ?? null
    const documentPath = diff?.path ?? path ?? summary.files[0]?.path
    if (!documentPath) return false

    const documentInput = checkpointDiffDocumentInput(summary, documentPath, diff)
    const documentQueryKey = checkpointDiffQueryKey(documentInput)
    queryClient.setQueryData(documentQueryKey, diff ? [diff] : [])
    selectFile(checkpointDiffDocumentId(documentInput))

    return true
  }

  return { openCheckpointDiff }
}
