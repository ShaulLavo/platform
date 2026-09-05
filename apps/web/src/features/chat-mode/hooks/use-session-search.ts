import { useEnvironmentId } from '@/lib/environments/hooks/use-environment-id'
import { useQuery } from '@tanstack/react-query'
import { useDebouncedValue } from '@tanstack/react-pacer/debouncer'
import { useEffect } from 'react'

import { useSessionRailStore } from '@/features/chat-mode/state/session-rail-store'
import { useSessionSearchStore } from '@/features/chat-mode/state/session-search-store'
import {
  SESSION_SEARCH_DEBOUNCE_MS,
  isSessionSearchQuery,
  sessionSearchQueryOptions,
} from '@/features/chat-mode/utils/session-search-query'

const NO_MATCHES: readonly [] = []

/**
 * Runs the rail's text through server-side message search and publishes the
 * result for the rail and the keyboard commands to read.
 *
 * The rail's own title/branch filter is unaffected and stays instant — this only
 * widens what counts as a match, so "where did I discuss X" stops being a
 * question the rail cannot answer.
 */
export function useSessionSearch() {
  const environmentId = useEnvironmentId()
  const query = useSessionRailStore((state) => state.query)
  const [settledQuery] = useDebouncedValue(query, { wait: SESSION_SEARCH_DEBOUNCE_MS })
  const result = useQuery(sessionSearchQueryOptions({ query: settledQuery }))
  const sync = useSessionSearchStore((state) => state.sync)
  const matches = result.data?.matches ?? NO_MATCHES
  // Keystrokes ahead of the settled query still count as searching, or the rail
  // announces "no matches" between characters.
  const searching = isSessionSearchQuery(query) && (result.isFetching || settledQuery !== query)

  useEffect(() => {
    sync({ environmentId, matches, query: settledQuery.trim(), searching })
  }, [environmentId, matches, searching, settledQuery, sync])
}
