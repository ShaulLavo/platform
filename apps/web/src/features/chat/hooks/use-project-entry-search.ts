import { useQuery } from '@tanstack/react-query'
import { useDebouncedValue } from '@tanstack/react-pacer/debouncer'

import {
  PROJECT_ENTRY_SEARCH_DEBOUNCE_MS,
  projectEntrySearchQueryOptions,
} from '@/features/chat/utils/project-entry-query'

/**
 * Mention suggestions for the composer. Every keystroke used to open its own
 * workspace search stream over the whole project; the query now follows a
 * settled query string, so a burst of typing costs one search instead of one
 * per character.
 */
export function useProjectEntrySearch({
  enabled,
  query,
  rootPath,
}: {
  enabled: boolean
  query: string
  rootPath: string
}) {
  const [settledQuery] = useDebouncedValue(query, { wait: PROJECT_ENTRY_SEARCH_DEBOUNCE_MS })
  const result = useQuery(
    projectEntrySearchQueryOptions({ enabled, query: settledQuery, rootPath }),
  )

  return {
    entries: result.data?.entries ?? [],
    // Keystrokes ahead of the settled query are still "searching" as far as the
    // menu is concerned, or the list flashes an empty state between characters.
    isSearching: result.isFetching || settledQuery !== query,
  }
}
