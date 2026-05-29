import { QueryClient } from '@tanstack/react-query'

import { installFileSnapshotQueryCachePolicy } from '@/lib/file-snapshot-query-cache'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 5 * 60 * 1000,
      retry: 1,
      staleTime: 10 * 1000,
    },
  },
})

installFileSnapshotQueryCachePolicy(queryClient)
