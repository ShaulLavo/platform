import { useQueryClient } from '@tanstack/react-query'

import { useEditorCommands } from '@/features/editor/state/editor-commands'
import { checkpointDiffDocumentId } from '@/features/git/diff-document'
import {
  canOpenCheckpointDiff,
  checkpointDiffDocumentInput,
  checkpointDiffRetry,
  checkpointDiffRetryDelay,
  checkpointFullThreadDiffDocumentInput,
  checkpointFullThreadDiffInputForSummary,
  checkpointDiffInputForSummary,
  checkpointDiffQueryKey,
  checkpointTurnDiffDocumentInput,
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
      retry: checkpointDiffRetry,
      retryDelay: checkpointDiffRetryDelay,
      staleTime: Infinity,
    })
    if (!path) {
      const documentInput = checkpointTurnDiffDocumentInput(summary)
      queryClient.setQueryData(checkpointDiffQueryKey(documentInput), diffs)
      selectFile(checkpointDiffDocumentId(documentInput))

      return true
    }

    const diff = matchingCheckpointDiff(diffs, path) ?? diffs[0] ?? null
    const documentPath = diff?.path ?? path ?? summary.files[0]?.path
    if (!documentPath) return false

    const documentInput = checkpointDiffDocumentInput(summary, documentPath, diff)
    const documentQueryKey = checkpointDiffQueryKey(documentInput)
    queryClient.setQueryData(documentQueryKey, diff ? [diff] : [])
    selectFile(checkpointDiffDocumentId(documentInput))

    return true
  }

  async function openFullThreadCheckpointDiff(summary: ChatTurnDiffSummary) {
    if (!canOpenCheckpointDiff(summary)) return false

    const input = checkpointFullThreadDiffInputForSummary(summary)
    const diffs = await queryClient.fetchQuery({
      queryFn: ({ signal }) => fetchCheckpointDiff(input, signal),
      queryKey: checkpointDiffQueryKey(input),
      retry: checkpointDiffRetry,
      retryDelay: checkpointDiffRetryDelay,
      staleTime: Infinity,
    })
    const documentInput = checkpointFullThreadDiffDocumentInput(summary)
    queryClient.setQueryData(checkpointDiffQueryKey(documentInput), diffs)
    selectFile(checkpointDiffDocumentId(documentInput))

    return true
  }

  return { openCheckpointDiff, openFullThreadCheckpointDiff }
}
