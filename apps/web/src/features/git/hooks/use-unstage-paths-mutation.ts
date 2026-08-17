import { useMutation } from '@tanstack/react-query'

import { unstagePaths } from '@/features/git/utils/api'
import { mutationKeys } from '@/features/git/utils/mutation-keys'
import { notifyMutationError } from '@/features/git/utils/notify-mutation-error'
import { useWorkspaceInvalidation } from './use-workspace-invalidation'

export function useUnstagePathsMutation(paths: readonly string[]) {
  const invalidate = useWorkspaceInvalidation()

  return useMutation({
    mutationFn: () => unstagePaths(paths),
    mutationKey: mutationKeys.unstageMany(paths),
    onError: notifyMutationError,
    onSuccess: invalidate,
  })
}
