import { useMutation } from "@tanstack/react-query"

import { createBranch } from "../api"
import { mutationKeys } from "../mutation-keys"
import { notifyMutationError } from "../notify-mutation-error"
import { useWorkspaceInvalidation } from "./use-workspace-invalidation"

export function useCreateBranchMutation(rootPath: string) {
  const invalidate = useWorkspaceInvalidation()

  return useMutation({
    mutationFn: (branch: string) => createBranch(rootPath, branch),
    mutationKey: mutationKeys.createBranch(rootPath),
    onError: notifyMutationError,
    onSuccess: invalidate,
  })
}
