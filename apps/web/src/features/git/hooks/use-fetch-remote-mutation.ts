import { useMutation } from "@tanstack/react-query"

import { fetchRemote } from "../api"
import { mutationKeys } from "../mutation-keys"
import { notifyMutationError } from "../notify-mutation-error"
import { useWorkspaceInvalidation } from "./use-workspace-invalidation"

export function useFetchRemoteMutation(rootPath: string) {
  const invalidate = useWorkspaceInvalidation()

  return useMutation({
    mutationFn: () => fetchRemote(rootPath),
    mutationKey: mutationKeys.fetch(rootPath),
    onError: notifyMutationError,
    onSuccess: invalidate,
  })
}
