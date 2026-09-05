import { clientForQueryClient } from '@/lib/environments/state/query-clients'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { fileSystemKeys } from '@/lib/query-keys'
import { commitChangesStreaming } from '@/features/git/utils/api'
import { mutationKeys } from '@/features/git/utils/mutation-keys'
import { notifyMutationError } from '@/features/git/utils/notify-mutation-error'
import { commitProgressStoreFor } from '@/features/git/state/commit-progress-store'
import { useWorkspaceInvalidation } from './use-workspace-invalidation'

export function useCommitMutation(rootPath: string) {
  const invalidate = useWorkspaceInvalidation()
  const queryClient = useQueryClient()

  return useMutation({
    // Streaming, so the repository's hooks can be seen working. A commit is the
    // one git command that runs arbitrary user code, and the previous one-shot
    // call left a slow hook looking exactly like a hung button.
    mutationFn: (message: string, { client }) => {
      const progress = commitProgressStoreFor(client).getState()
      progress.clearCommitProgress(rootPath)

      return commitChangesStreaming(
        rootPath,
        message,
        (line) => progress.appendCommitProgress(rootPath, line),
        clientForQueryClient(client),
      )
    },
    mutationKey: mutationKeys.commit(rootPath),
    onError: notifyMutationError,
    onSuccess: (result) => {
      if (result.kind === 'message-file') {
        void queryClient.invalidateQueries({
          queryKey: fileSystemKeys.fileSnapshot(result.path),
        })
        toast.info('Opened commit message')
        return
      }

      toast.success('Committed changes')
      // Only on success: a rejected commit's output is the explanation, and
      // clearing it would take away the only thing that says what to fix.
      commitProgressStoreFor(queryClient).getState().clearCommitProgress(rootPath)
      invalidate()
    },
  })
}
