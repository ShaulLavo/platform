import { useQuery } from '@tanstack/react-query'
import type { LogDashboardFilters } from '@workspace/contracts'

import { logsKeys } from '@/lib/query-keys'
import { fetchLogEvents } from './api'
import { logFilterQuery } from './log-filter-params'

export function useLogEvents(filters: LogDashboardFilters, enabled = true) {
  const queryFilters = logFilterQuery(filters)

  return useQuery({
    enabled,
    notifyOnChangeProps: ['data', 'isError'],
    queryFn: ({ signal }) => fetchLogEvents(filters, signal),
    queryKey: logsKeys.events(queryFilters),
    staleTime: 1_000,
  })
}
