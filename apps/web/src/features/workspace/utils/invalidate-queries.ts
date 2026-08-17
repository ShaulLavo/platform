import type { QueryClient } from '@tanstack/react-query'

import { fileSystemKeys, gitKeys } from '@/lib/query-keys'

/**
 * Every tree mutation — drop, create, rename, duplicate, delete — changes both
 * what is on disk and what git thinks of it, so they all settle the same pair
 * of caches.
 */
export function invalidateTreeQueries(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: gitKeys.all })
  void queryClient.invalidateQueries({ queryKey: fileSystemKeys.trees() })
}
