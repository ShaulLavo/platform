import { useQueryClient } from '@tanstack/react-query'

import { useEditorCommands } from '@/features/editor/state/commands'
import { checkpointDiffDocumentId } from '@/features/git/utils/diff-document'
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
import { useThreadDiffScopeStore } from '../state/thread-diff-scope-store'

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
      rememberTurnScope(summary, null)

      return true
    }

    const diff = matchingCheckpointDiff(diffs, path) ?? diffs[0] ?? null
    const documentPath = diff?.path ?? path ?? summary.files[0]?.path
    if (!documentPath) return false

    const documentInput = checkpointDiffDocumentInput(summary, documentPath, diff)
    // Seed only a diff we actually have: the viewer reads this key and treats a
    // seeded entry as final, so seeding an empty list for a file the range fetch
    // missed would pin the tab to "no changes" instead of letting it ask again.
    if (diff) queryClient.setQueryData(checkpointDiffQueryKey(documentInput), [diff])
    selectFile(checkpointDiffDocumentId(documentInput))
    rememberTurnScope(summary, documentPath)

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

/**
 * Opening a turn's diff is the act that makes it the thread's current diff, so
 * the tool pane comes back to it after a reload — wherever the open came from,
 * the transcript's changed-files card included. Read through `getState` rather
 * than subscribed: this hook must not re-render every consumer of a card when
 * the pick changes. The full-thread diff is deliberately not recorded; it is not
 * one of the three scopes the pane can return to.
 */
function rememberTurnScope(summary: ChatTurnDiffSummary, filePath: string | null) {
  useThreadDiffScopeStore.getState().selectThreadDiffScope(summary.threadId, {
    filePath,
    kind: 'turn',
    turnId: summary.turnId,
  })
}
