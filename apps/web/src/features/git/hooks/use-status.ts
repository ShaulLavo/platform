import { useQuery } from '@tanstack/react-query'

import { gitKeys } from '@/lib/query-keys'
import { fetchStatus } from '../api'

export function useStatus(rootPath: string | null) {
  return useQuery({
    enabled: Boolean(rootPath),
    queryFn: ({ signal }) => fetchStatusForRoot(rootPath, signal),
    queryKey: gitKeys.status(rootPath ?? ''),
    staleTime: 1000,
  })
}

function fetchStatusForRoot(rootPath: string | null, signal: AbortSignal) {
  return fetchStatus(rootPath ?? '', signal)
}
