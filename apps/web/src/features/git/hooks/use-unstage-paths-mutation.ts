import { useMutation } from "@tanstack/react-query"

import { unstagePaths } from "../api"
import { mutationKeys } from "../mutation-keys"
import { notifyMutationError } from "../notify-mutation-error"
import { useWorkspaceInvalidation } from "./use-workspace-invalidation"

export function useUnstagePathsMutation(paths: readonly string[]) {
  const invalidate = useWorkspaceInvalidation()

  return useMutation({
    mutationFn: () => unstagePaths(paths),
    mutationKey: mutationKeys.unstageMany(paths),
    onError: notifyMutationError,
    onSuccess: invalidate,
  })
}
