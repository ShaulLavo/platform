import { useMutation } from '@tanstack/react-query'

import { checkoutBranch } from '../api'
import { mutationKeys } from '../mutation-keys'
import { notifyMutationError } from '../notify-mutation-error'
import { useWorkspaceInvalidation } from './use-workspace-invalidation'

export function useCheckoutBranchMutation(rootPath: string) {
  const invalidate = useWorkspaceInvalidation()

  return useMutation({
    mutationFn: (branch: string) => checkoutBranch(rootPath, branch),
    mutationKey: mutationKeys.checkout(rootPath),
    onError: notifyMutationError,
    onSuccess: invalidate,
  })
}
