import type { useQueryClient } from '@tanstack/react-query'

import { fileSystemKeys, gitKeys } from '@/lib/query-keys'

export function invalidateWorkspace(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: gitKeys.all })
  void queryClient.invalidateQueries({ queryKey: fileSystemKeys.fileSnapshots() })
  void queryClient.invalidateQueries({ queryKey: fileSystemKeys.trees() })
}
