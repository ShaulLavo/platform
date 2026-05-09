import { useMutation } from "@tanstack/react-query"

import { stagePaths } from "../api"
import { mutationKeys } from "../mutation-keys"
import { notifyMutationError } from "../notify-mutation-error"
import { useWorkspaceInvalidation } from "./use-workspace-invalidation"

export function useStagePathsMutation(paths: readonly string[]) {
  const invalidate = useWorkspaceInvalidation()

  return useMutation({
    mutationFn: () => stagePaths(paths),
    mutationKey: mutationKeys.stageMany(paths),
    onError: notifyMutationError,
    onSuccess: invalidate,
  })
}
