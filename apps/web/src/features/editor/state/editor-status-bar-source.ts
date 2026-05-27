import type { ReactEditorController } from '@editor/react'

import type { EditorLanguageServerStatusSource } from '@/features/editor/state/editor-language-server-status-source'

export type EditorStatusBarSource = {
  controller: ReactEditorController
  filePath: string
  languageServerStatusSource: EditorLanguageServerStatusSource
}

export function editorStatusBarSourcesEqual(
  left: EditorStatusBarSource | null,
  right: EditorStatusBarSource | null,
) {
  if (left === right) return true
  if (!left || !right) return false

  return (
    left.controller === right.controller &&
    left.filePath === right.filePath &&
    left.languageServerStatusSource === right.languageServerStatusSource
  )
}
