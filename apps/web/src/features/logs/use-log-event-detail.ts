import { useQuery } from '@tanstack/react-query'

import { logsKeys } from '@/lib/query-keys'
import { fetchLogEventDetail } from './api'

export function useLogEventDetail(id: string | null, enabled = true) {
  return useQuery({
    enabled: enabled && id !== null,
    notifyOnChangeProps: ['data', 'isError'],
    queryFn: ({ signal }) => fetchLogEventDetail(id ?? '', signal),
    queryKey: logsKeys.detail(id ?? ''),
    staleTime: 5_000,
  })
}
