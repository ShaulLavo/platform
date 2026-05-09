import { useMutation } from "@tanstack/react-query"

import { stagePath } from "../api"
import { mutationKeys } from "../mutation-keys"
import { notifyMutationError } from "../notify-mutation-error"
import { useWorkspaceInvalidation } from "./use-workspace-invalidation"

export function useStagePathMutation(path: string) {
  const invalidate = useWorkspaceInvalidation()

  return useMutation({
    mutationFn: () => stagePath(path),
    mutationKey: mutationKeys.stage(path),
    onError: notifyMutationError,
    onSuccess: invalidate,
  })
}
