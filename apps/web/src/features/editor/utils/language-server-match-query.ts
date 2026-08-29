import { getClient } from '@/lib/client'
import {
  languageServerMatches,
  type LanguageServerMatch,
} from '@/features/editor/utils/language-server-plugin'

const LANGUAGE_SERVER_MATCH_STALE_MS = 30_000

export function languageServerMatchQueryOptions(rootPath: string, matchPath: string) {
  return {
    queryFn: async ({ signal }: { readonly signal: AbortSignal }) => {
      const response = await getClient().lsp.match.get({
        query: { path: matchPath, root: rootPath },
        fetch: { signal },
      })
      if (response.error) return [] as readonly LanguageServerMatch[]

      return languageServerMatches(response.data)
    },
    queryKey: ['language-server-matches', rootPath, matchPath] as const,
    staleTime: LANGUAGE_SERVER_MATCH_STALE_MS,
  }
}
