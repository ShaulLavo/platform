import { useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"

import { invalidateWorkspace } from "../invalidate-workspace"

export function useWorkspaceInvalidation() {
  const queryClient = useQueryClient()

  return useCallback(() => {
    invalidateWorkspace(queryClient)
  }, [queryClient])
}
