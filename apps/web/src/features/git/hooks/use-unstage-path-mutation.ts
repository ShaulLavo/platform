import { useMutation } from '@tanstack/react-query'

import { unstagePath } from '../api'
import { mutationKeys } from '../mutation-keys'
import { notifyMutationError } from '../notify-mutation-error'
import { useWorkspaceInvalidation } from './use-workspace-invalidation'

export function useUnstagePathMutation(path: string) {
  const invalidate = useWorkspaceInvalidation()

  return useMutation({
    mutationFn: () => unstagePath(path),
    mutationKey: mutationKeys.unstage(path),
    onError: notifyMutationError,
    onSuccess: invalidate,
  })
}
