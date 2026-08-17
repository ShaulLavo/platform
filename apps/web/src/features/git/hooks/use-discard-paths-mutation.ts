import { useMutation } from '@tanstack/react-query'

import { discardPaths } from '@/features/git/utils/api'
import { mutationKeys } from '@/features/git/utils/mutation-keys'
import { notifyMutationError } from '@/features/git/utils/notify-mutation-error'
import { useWorkspaceInvalidation } from './use-workspace-invalidation'

export function useDiscardPathsMutation(paths: readonly string[]) {
  const invalidate = useWorkspaceInvalidation()

  return useMutation({
    mutationFn: () => discardPaths(paths),
    mutationKey: mutationKeys.discardMany(paths),
    onError: notifyMutationError,
    onSuccess: invalidate,
  })
}
