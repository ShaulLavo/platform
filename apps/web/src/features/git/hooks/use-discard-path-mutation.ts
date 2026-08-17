import { useMutation } from '@tanstack/react-query'

import { discardPath } from '@/features/git/utils/api'
import { mutationKeys } from '@/features/git/utils/mutation-keys'
import { notifyMutationError } from '@/features/git/utils/notify-mutation-error'
import { useWorkspaceInvalidation } from './use-workspace-invalidation'

export function useDiscardPathMutation(path: string) {
  const invalidate = useWorkspaceInvalidation()

  return useMutation({
    mutationFn: () => discardPath(path),
    mutationKey: mutationKeys.discard(path),
    onError: notifyMutationError,
    onSuccess: invalidate,
  })
}
