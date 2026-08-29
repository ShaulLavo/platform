import { useQuery } from '@tanstack/react-query'

import type { LanguageServerMatch } from '@/features/editor/utils/language-server-plugin'
import { languageServerMatchQueryOptions } from '@/features/editor/utils/language-server-match-query'
import { useLanguageServerMatchConfiguration } from '@/features/editor/providers/language-server-match-context'

const NO_LANGUAGE_SERVER_MATCHES: readonly LanguageServerMatch[] = []

export function useLanguageServerMatches(
  rootPath: string,
  matchPath: string,
  enabled = true,
): readonly LanguageServerMatch[] | null {
  const configuration = useLanguageServerMatchConfiguration()
  const query = useQuery({
    ...languageServerMatchQueryOptions(rootPath, matchPath, configuration),
    enabled,
  })

  if (!enabled) return NO_LANGUAGE_SERVER_MATCHES
  if (query.isError) return NO_LANGUAGE_SERVER_MATCHES
  return query.data ?? null
}
