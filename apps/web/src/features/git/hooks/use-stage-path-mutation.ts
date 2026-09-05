import { clientForQueryClient } from '@/lib/environments/state/query-clients'
import { useMutation } from '@tanstack/react-query'

import { stagePath } from '@/features/git/utils/api'
import { mutationKeys } from '@/features/git/utils/mutation-keys'
import { notifyMutationError } from '@/features/git/utils/notify-mutation-error'
import { useWorkspaceInvalidation } from './use-workspace-invalidation'

export function useStagePathMutation(path: string) {
  const invalidate = useWorkspaceInvalidation()

  return useMutation({
    mutationFn: (_variables, { client }) => stagePath(path, clientForQueryClient(client)),
    mutationKey: mutationKeys.stage(path),
    onError: notifyMutationError,
    onSuccess: invalidate,
  })
}
