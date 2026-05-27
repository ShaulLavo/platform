import type {
  LanguageServerDefinitionTarget,
  LanguageServerReferencesResult,
} from '@editor/language-server'
import { useMemo } from 'react'

import { createMatchedLanguageServerPlugin } from '@/features/editor/editor-language-server-plugin'
import { createEditorLanguageServerStatusSource } from '@/features/editor/state/editor-language-server-status-source'

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

  const languageServer = useMemo(() => {
    return createMatchedLanguageServerPlugin({
      enabled,
      filePath,
      rootPath,
      statusSource: languageServerStatusSource,
      onOpenDefinition,
      onOpenReferences,
    })
  }, [enabled, filePath, languageServerStatusSource, onOpenDefinition, onOpenReferences, rootPath])

  return {
    languageServer,
    languageServerStatusSource,
  }
}
