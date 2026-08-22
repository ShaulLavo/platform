import type {
  LanguageServerDefinitionTarget,
  LanguageServerReferencesResult,
} from '@singapor/lsp-plugin'
import { useEffect, useMemo } from 'react'

import { createMatchedLanguageServerPlugin } from '@/features/editor/utils/language-server-plugin'
import { useLanguageServerMatch } from '@/features/editor/hooks/use-language-server-match'
import { createEditorLanguageServerStatusSource } from '@/features/editor/state/language-server-status-source'

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
  const match = useLanguageServerMatch(rootPath, filePath, enabled)

  // Cleared whenever the file or the root changes, not only when the plugin is turned off: the
  // indicator would otherwise keep showing the previous file's server while this one is matching.
  useEffect(() => {
    languageServerStatusSource.reset()
  }, [enabled, filePath, languageServerStatusSource, rootPath])

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
