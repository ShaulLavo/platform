import { useQuery } from '@tanstack/react-query'

import { gitKeys } from '@/lib/query-keys'
import { fetchBranches } from '../api'

export function useBranches(rootPath: string | null) {
  return useQuery({
    enabled: Boolean(rootPath),
    queryFn: ({ signal }) => fetchBranches(rootPath ?? '', signal),
    queryKey: gitKeys.branches(rootPath ?? ''),
    staleTime: 1000,
  })
}
