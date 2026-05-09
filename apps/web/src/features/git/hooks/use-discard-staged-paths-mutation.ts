import { useMutation } from "@tanstack/react-query"

import { discardPaths, unstagePaths } from "../api"
import { mutationKeys } from "../mutation-keys"
import { notifyMutationError } from "../notify-mutation-error"
import { useWorkspaceInvalidation } from "./use-workspace-invalidation"

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
