import { useQuery } from '@tanstack/react-query'

import type { LanguageServerMatch } from '@/features/editor/utils/language-server-plugin'
import { languageServerMatchQueryOptions } from '@/features/editor/utils/language-server-match-query'

const NO_LANGUAGE_SERVER_MATCHES: readonly LanguageServerMatch[] = []

export function useLanguageServerMatches(
  rootPath: string,
  matchPath: string,
  enabled = true,
): readonly LanguageServerMatch[] | null {
  const query = useQuery({
    ...languageServerMatchQueryOptions(rootPath, matchPath),
    enabled,
  })

  if (!enabled) return NO_LANGUAGE_SERVER_MATCHES
  if (query.isError) return NO_LANGUAGE_SERVER_MATCHES
  return query.data ?? null
}
