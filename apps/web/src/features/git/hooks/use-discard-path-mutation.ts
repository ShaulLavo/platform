import { useMutation } from "@tanstack/react-query"

import { discardPath } from "../api"
import { mutationKeys } from "../mutation-keys"
import { notifyMutationError } from "../notify-mutation-error"
import { useWorkspaceInvalidation } from "./use-workspace-invalidation"

export function useDiscardPathMutation(path: string) {
  const invalidate = useWorkspaceInvalidation()

  return useMutation({
    mutationFn: () => discardPath(path),
    mutationKey: mutationKeys.discard(path),
    onError: notifyMutationError,
    onSuccess: invalidate,
  })
}
