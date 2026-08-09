import { useQuery } from '@tanstack/react-query'

import { fetchSettings } from '../api'
import { settingsKeys } from '../query-keys'

/**
 * The whole settings document, as the server sees it. Every consumer reads the
 * same query so a save anywhere lands everywhere at once.
 */
export function useSettings() {
  return useQuery({
    queryFn: ({ signal }) => fetchSettings(signal),
    queryKey: settingsKeys.document(),
    staleTime: Number.POSITIVE_INFINITY,
  })
}
