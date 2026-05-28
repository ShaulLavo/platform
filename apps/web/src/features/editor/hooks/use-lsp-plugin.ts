import type {
  LanguageServerDefinitionTarget,
  LanguageServerReferencesResult,
} from '@editor/lsp-plugin'
import { useEffect, useMemo, useState } from 'react'

import {
  createMatchedLanguageServerPlugin,
  languageServerMatch,
  type LanguageServerMatch,
} from '@/features/editor/editor-language-server-plugin'
import { createEditorLanguageServerStatusSource } from '@/features/editor/state/editor-language-server-status-source'
import { client } from '@/lib/client'

type UseLanguageServerPluginOptions = {
  enabled?: boolean
  filePath: string
  rootPath: string
  onOpenDefinition?: (target: LanguageServerDefinitionTarget) => void | boolean
  onOpenReferences?: (result: LanguageServerReferencesResult) => void | boolean
}

export function useLanguageServerPlugin({
  enabled = true,
  filePath,
  rootPath,
  onOpenDefinition,
  onOpenReferences,
}: UseLanguageServerPluginOptions) {
  const languageServerStatusSource = useMemo(() => createEditorLanguageServerStatusSource(), [])
  const matchKey = languageServerMatchKey(rootPath, filePath)
  const [matchState, setMatchState] = useState<LanguageServerMatchState | null>(null)
  const match = enabled && matchState?.key === matchKey ? matchState.match : null

  useEffect(() => {
    languageServerStatusSource.reset()
    if (!enabled) return

    const controller = new AbortController()
    client.lsp.match
      .get({
        query: { path: filePath, root: rootPath },
        fetch: { signal: controller.signal },
      })
      .then((response) => {
        if (controller.signal.aborted) return

        setMatchState({
          key: matchKey,
          match: response.error ? null : languageServerMatch(response.data),
        })
      })
      .catch(() => {
        if (controller.signal.aborted) return

        setMatchState({ key: matchKey, match: null })
      })

    return () => controller.abort()
  }, [enabled, filePath, languageServerStatusSource, matchKey, rootPath])

  const languageServer = useMemo(() => {
    return createMatchedLanguageServerPlugin({
      enabled,
      filePath,
      match,
      rootPath,
      statusSource: languageServerStatusSource,
      onOpenDefinition,
      onOpenReferences,
    })
  }, [
    enabled,
    filePath,
    languageServerStatusSource,
    match,
    onOpenDefinition,
    onOpenReferences,
    rootPath,
  ])

  return {
    languageServer,
    languageServerStatusSource,
  }
}

type LanguageServerMatchState = {
  readonly key: string
  readonly match: LanguageServerMatch | null
}

function languageServerMatchKey(rootPath: string, filePath: string) {
  return `${rootPath}\u0000${filePath}`
}
