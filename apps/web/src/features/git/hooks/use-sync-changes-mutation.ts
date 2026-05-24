import { useMutation } from '@tanstack/react-query'

import { syncRemote } from '../api'
import { mutationKeys } from '../mutation-keys'
import { notifyMutationError } from '../notify-mutation-error'
import { useWorkspaceInvalidation } from './use-workspace-invalidation'

export function useSyncChangesMutation(rootPath: string) {
  const invalidate = useWorkspaceInvalidation()

  return useMutation({
    mutationFn: () => syncRemote(rootPath),
    mutationKey: mutationKeys.sync(rootPath),
    onError: notifyMutationError,
    onSuccess: invalidate,
  })
}
