import { useQuery } from '@tanstack/react-query'

import type { LanguageServerMatch } from '@/features/editor/utils/language-server-plugin'
import { languageServerMatchQueryOptions } from '@/features/editor/utils/language-server-match-query'
import { useSettingValue } from '@/features/settings/hooks/use-setting-value'

const NO_LANGUAGE_SERVER_MATCHES: readonly LanguageServerMatch[] = []

export function useLanguageServerMatches(
  rootPath: string,
  matchPath: string,
  enabled = true,
): readonly LanguageServerMatch[] | null {
  const tyForPython = useSettingValue('lsp.experimental.tyForPython')
  const languageServers = useSettingValue('lsp.languageServers')
  const servers = useSettingValue('lsp.servers')
  const query = useQuery({
    ...languageServerMatchQueryOptions(rootPath, matchPath, {
      'lsp.experimental.tyForPython': tyForPython,
      'lsp.languageServers': languageServers,
      'lsp.servers': servers,
    }),
    enabled,
  })

  if (!enabled) return NO_LANGUAGE_SERVER_MATCHES
  if (query.isError) return NO_LANGUAGE_SERVER_MATCHES
  return query.data ?? null
}
