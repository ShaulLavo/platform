import { clientForQueryClient } from '@/lib/environments/state/query-clients'
import { useMutation } from '@tanstack/react-query'

import { discardPaths, unstagePaths } from '@/features/git/utils/api'
import { mutationKeys } from '@/features/git/utils/mutation-keys'
import { notifyMutationError } from '@/features/git/utils/notify-mutation-error'
import { useWorkspaceInvalidation } from './use-workspace-invalidation'

export function useDiscardStagedPathsMutation(paths: readonly string[]) {
  const invalidate = useWorkspaceInvalidation()

  return useMutation({
    mutationFn: async (_variables, { client }) => {
      const owner = clientForQueryClient(client)
      await unstagePaths(paths, owner)
      return discardPaths(paths, owner)
    },
    mutationKey: mutationKeys.discardStagedMany(paths),
    onError: notifyMutationError,
    onSuccess: invalidate,
  })
}
