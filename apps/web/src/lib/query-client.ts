import { QueryClient } from '@tanstack/react-query'

import { installFileContentQueryCachePolicy } from '@/lib/file-query-cache'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 5 * 60 * 1000,
      retry: 1,
      staleTime: 10 * 1000,
    },
  },
})

installFileContentQueryCachePolicy(queryClient)
