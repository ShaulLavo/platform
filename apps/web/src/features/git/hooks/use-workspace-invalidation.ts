import { useQueryClient } from '@tanstack/react-query'

import { invalidateWorkspace } from '../invalidate-workspace'

export function useWorkspaceInvalidation() {
  const queryClient = useQueryClient()

  return () => {
    invalidateWorkspace(queryClient)
  }
}
