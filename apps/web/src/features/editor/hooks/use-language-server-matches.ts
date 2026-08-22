import { useEffect, useState } from 'react'

import {
  languageServerMatches,
  type LanguageServerMatch,
} from '@/features/editor/utils/language-server-plugin'
import { getClient } from '@/lib/client'

const NO_LANGUAGE_SERVER_MATCHES: readonly LanguageServerMatch[] = []

export function useLanguageServerMatches(
  rootPath: string,
  matchPath: string,
  enabled = true,
): readonly LanguageServerMatch[] | null {
  const key = `${rootPath}\u0000${matchPath}`
  const [state, setState] = useState<MatchState | null>(null)

  useEffect(() => {
    if (!enabled) return

    const controller = new AbortController()
    getClient()
      .lsp.match.get({
        query: { path: matchPath, root: rootPath },
        fetch: { signal: controller.signal },
      })
      .then((response) => {
        if (controller.signal.aborted) return

        setState({
          key,
          matches: response.error ? [] : languageServerMatches(response.data),
        })
      })
      .catch(() => {
        if (controller.signal.aborted) return

        setState({ key, matches: [] })
      })

    return () => controller.abort()
  }, [enabled, key, matchPath, rootPath])

  if (!enabled) return NO_LANGUAGE_SERVER_MATCHES
  return state?.key === key ? state.matches : null
}

type MatchState = {
  readonly key: string
  readonly matches: readonly LanguageServerMatch[]
}
