import { useMutation, useQueryClient } from '@tanstack/react-query'

import { gitKeys } from '@/lib/query-keys'
import { createPullRequest } from '@/features/git/utils/api'
import { mutationKeys } from '@/features/git/utils/mutation-keys'
import { notifyMutationError } from '@/features/git/utils/notify-mutation-error'

export function useCreatePullRequestMutation(rootPath: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { base?: string; body?: string; draft?: boolean; title: string }) =>
      createPullRequest({ ...input, path: rootPath }),
    mutationKey: mutationKeys.createPullRequest(rootPath),
    onError: notifyMutationError,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: gitKeys.pullRequestState(rootPath) }),
  })
}
