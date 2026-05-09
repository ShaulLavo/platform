import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { fileSystemKeys } from "@/lib/query-keys"
import { commitChanges } from "../api"
import { mutationKeys } from "../mutation-keys"
import { notifyMutationError } from "../notify-mutation-error"
import { useWorkspaceInvalidation } from "./use-workspace-invalidation"

export function useCommitMutation(rootPath: string) {
  const invalidate = useWorkspaceInvalidation()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (message: string) => commitChanges(rootPath, message),
    mutationKey: mutationKeys.commit(rootPath),
    onError: notifyMutationError,
    onSuccess: (result) => {
      if (result.kind === "message-file") {
        void queryClient.invalidateQueries({
          queryKey: fileSystemKeys.file(result.path),
        })
        toast.info("Opened commit message")
        return
      }

      toast.success("Committed changes")
      invalidate()
    },
  })
}
