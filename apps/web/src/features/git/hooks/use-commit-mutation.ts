import { useMutation } from "@tanstack/react-query"
import { toast } from "sonner"

import { commitChanges } from "../api"
import { mutationKeys } from "../mutation-keys"
import { notifyMutationError } from "../notify-mutation-error"
import { useWorkspaceInvalidation } from "./use-workspace-invalidation"

export function useCommitMutation(rootPath: string) {
  const invalidate = useWorkspaceInvalidation()

  return useMutation({
    mutationFn: (message: string) => commitChanges(rootPath, message),
    mutationKey: mutationKeys.commit(rootPath),
    onError: notifyMutationError,
    onSuccess: () => {
      toast.success("Committed changes")
      invalidate()
    },
  })
}
