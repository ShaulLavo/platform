import { useMutation } from "@tanstack/react-query"

import { pushRemote } from "../api"
import { mutationKeys } from "../mutation-keys"
import { notifyMutationError } from "../notify-mutation-error"
import { useWorkspaceInvalidation } from "./use-workspace-invalidation"

export function usePushRemoteMutation(rootPath: string) {
  const invalidate = useWorkspaceInvalidation()

  return useMutation({
    mutationFn: () => pushRemote(rootPath),
    mutationKey: mutationKeys.push(rootPath),
    onError: notifyMutationError,
    onSuccess: invalidate,
  })
}
