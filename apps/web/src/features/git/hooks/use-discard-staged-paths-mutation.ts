import { useMutation } from '@tanstack/react-query'

import { discardPaths, unstagePaths } from '@/features/git/utils/api'
import { mutationKeys } from '@/features/git/utils/mutation-keys'
import { notifyMutationError } from '@/features/git/utils/notify-mutation-error'
import { useWorkspaceInvalidation } from './use-workspace-invalidation'

export function useDiscardStagedPathsMutation(paths: readonly string[]) {
  const invalidate = useWorkspaceInvalidation()

  return useMutation({
    mutationFn: async () => {
      await unstagePaths(paths)
      return discardPaths(paths)
    },
    mutationKey: mutationKeys.discardStagedMany(paths),
    onError: notifyMutationError,
    onSuccess: invalidate,
  })
}
