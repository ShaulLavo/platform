import { useQuery } from '@tanstack/react-query'
import type { LogDashboardFilters } from '@workspace/contracts'

import { logsKeys } from '@/lib/query-keys'
import { fetchLogSummary } from './api'
import { logFilterQuery } from './log-filter-params'

export function useLogSummary(filters: LogDashboardFilters, enabled = true) {
  const queryFilters = logFilterQuery(filters)

  return useQuery({
    enabled,
    notifyOnChangeProps: ['data', 'isError', 'isFetching'],
    queryFn: ({ signal }) => fetchLogSummary(filters, signal),
    queryKey: logsKeys.summary(queryFilters),
    staleTime: 1_000,
  })
}
