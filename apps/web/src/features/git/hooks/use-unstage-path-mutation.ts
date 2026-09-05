import { clientForQueryClient } from '@/lib/environments/state/query-clients'
import { useMutation } from '@tanstack/react-query'

import { unstagePath } from '@/features/git/utils/api'
import { mutationKeys } from '@/features/git/utils/mutation-keys'
import { notifyMutationError } from '@/features/git/utils/notify-mutation-error'
import { useWorkspaceInvalidation } from './use-workspace-invalidation'

export function useUnstagePathMutation(path: string) {
  const invalidate = useWorkspaceInvalidation()

  return useMutation({
    mutationFn: (_variables, { client }) => unstagePath(path, clientForQueryClient(client)),
    mutationKey: mutationKeys.unstage(path),
    onError: notifyMutationError,
    onSuccess: invalidate,
  })
}
