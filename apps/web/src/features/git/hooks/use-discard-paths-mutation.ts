import { useMutation } from "@tanstack/react-query"

import { discardPaths } from "../api"
import { mutationKeys } from "../mutation-keys"
import { notifyMutationError } from "../notify-mutation-error"
import { useWorkspaceInvalidation } from "./use-workspace-invalidation"

export function useDiscardPathsMutation(paths: readonly string[]) {
  const invalidate = useWorkspaceInvalidation()

  return useMutation({
    mutationFn: () => discardPaths(paths),
    mutationKey: mutationKeys.discardMany(paths),
    onError: notifyMutationError,
    onSuccess: invalidate,
  })
}
