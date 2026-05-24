import { useMutation } from '@tanstack/react-query'

import { pullRemote } from '../api'
import { mutationKeys } from '../mutation-keys'
import { notifyMutationError } from '../notify-mutation-error'
import { useWorkspaceInvalidation } from './use-workspace-invalidation'

export function usePullRemoteMutation(rootPath: string) {
  const invalidate = useWorkspaceInvalidation()

  return useMutation({
    mutationFn: () => pullRemote(rootPath),
    mutationKey: mutationKeys.pull(rootPath),
    onError: notifyMutationError,
    onSuccess: invalidate,
  })
}
