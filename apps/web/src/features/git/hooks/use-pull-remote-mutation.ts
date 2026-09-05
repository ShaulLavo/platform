import { clientForQueryClient } from '@/lib/environments/state/query-clients'
import { useMutation } from '@tanstack/react-query'

import { pullRemote } from '@/features/git/utils/api'
import { mutationKeys } from '@/features/git/utils/mutation-keys'
import { notifyMutationError } from '@/features/git/utils/notify-mutation-error'
import { useWorkspaceInvalidation } from './use-workspace-invalidation'

export function usePullRemoteMutation(rootPath: string) {
  const invalidate = useWorkspaceInvalidation()

  return useMutation({
    mutationFn: (_variables, { client }) => pullRemote(rootPath, clientForQueryClient(client)),
    mutationKey: mutationKeys.pull(rootPath),
    onError: notifyMutationError,
    onSuccess: invalidate,
  })
}
