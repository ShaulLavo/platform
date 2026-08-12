import { useMutation, useQueryClient } from '@tanstack/react-query'

import { gitKeys } from '@/lib/query-keys'
import { createPullRequest } from '../api'
import { mutationKeys } from '../mutation-keys'
import { notifyMutationError } from '../notify-mutation-error'

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
