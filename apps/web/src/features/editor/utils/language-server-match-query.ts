import { getClient } from '@/lib/client'
import type { SettingsValues } from '@workspace/contracts'
import {
  languageServerMatches,
  type LanguageServerMatch,
} from '@/features/editor/utils/language-server-plugin'

const LANGUAGE_SERVER_MATCH_STALE_MS = 30_000

export type LanguageServerMatchConfiguration = Pick<
  SettingsValues,
  'lsp.experimental.tyForPython' | 'lsp.languageServers' | 'lsp.servers'
>

export function languageServerMatchQueryOptions(
  rootPath: string,
  matchPath: string,
  configuration: LanguageServerMatchConfiguration,
) {
  return {
    queryFn: async ({ signal }: { readonly signal: AbortSignal }) => {
      const response = await getClient().lsp.match.get({
        query: { path: matchPath, root: rootPath },
        fetch: { signal },
      })
      if (response.error) return [] as readonly LanguageServerMatch[]

      return languageServerMatches(response.data)
    },
    queryKey: ['language-server-matches', rootPath, matchPath, configuration] as const,
    staleTime: LANGUAGE_SERVER_MATCH_STALE_MS,
  }
}
