import type {
  LanguageServerDefinitionTarget,
  LanguageServerReferencesResult,
} from '@singapor/lsp-plugin'
import { useMemo } from 'react'

import {
  createMatchedLanguageServerPlugin,
  type LanguageServerDocumentTarget,
} from '@/features/editor/utils/language-server-plugin'
import { useLanguageServerMatches } from '@/features/editor/hooks/use-language-server-matches'
import { createEditorLanguageServerStatusSource } from '@/features/editor/state/language-server-status-source'

type UseLanguageServerPluginOptions = {
  enabled?: boolean
  filePath: string
  languageServerTarget?: LanguageServerDocumentTarget
  rootPath: string
  onOpenDefinition?: (target: LanguageServerDefinitionTarget) => void | boolean
  onOpenReferences?: (result: LanguageServerReferencesResult) => void | boolean
}

export function useLanguageServerPlugin({
  enabled = true,
  filePath,
  languageServerTarget,
  rootPath,
  onOpenDefinition,
  onOpenReferences,
}: UseLanguageServerPluginOptions) {
  const languageServerStatusSource = useMemo(() => createEditorLanguageServerStatusSource(), [])
  const target = useMemo(
    () => languageServerTarget ?? { matchPath: filePath },
    [filePath, languageServerTarget],
  )
  const matches = useLanguageServerMatches(rootPath, target.matchPath, enabled)

  const languageServer = useMemo(() => {
    return createMatchedLanguageServerPlugin({
      enabled,
      matches,
      rootPath,
      statusSource: languageServerStatusSource,
      target,
      onOpenDefinition,
      onOpenReferences,
    })
  }, [
    enabled,
    languageServerStatusSource,
    matches,
    onOpenDefinition,
    onOpenReferences,
    rootPath,
    target,
  ])

  return {
    languageServer,
    languageServerStatusSource,
  }
}
