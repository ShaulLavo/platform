import { clientForQueryClient } from '@/lib/environments/state/query-clients'
import { useMutation } from '@tanstack/react-query'

import { stagePaths } from '@/features/git/utils/api'
import { mutationKeys } from '@/features/git/utils/mutation-keys'
import { notifyMutationError } from '@/features/git/utils/notify-mutation-error'
import { useWorkspaceInvalidation } from './use-workspace-invalidation'

export function useStagePathsMutation(paths: readonly string[]) {
  const invalidate = useWorkspaceInvalidation()

  return useMutation({
    mutationFn: (_variables, { client }) => stagePaths(paths, clientForQueryClient(client)),
    mutationKey: mutationKeys.stageMany(paths),
    onError: notifyMutationError,
    onSuccess: invalidate,
  })
}
