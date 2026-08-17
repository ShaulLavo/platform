import { useQuery } from '@tanstack/react-query'

import { fetchSettings } from '@/features/settings/utils/api'
import { settingsKeys } from '@/features/settings/utils/query-keys'

/**
 * The whole resolved settings snapshot, as the server sees it. Every consumer
 * reads the same query so a save anywhere lands everywhere at once.
 */
export function useSettings() {
  return useQuery({
    queryFn: ({ signal }) => fetchSettings(signal),
    queryKey: settingsKeys.document(),
    staleTime: Number.POSITIVE_INFINITY,
  })
}
