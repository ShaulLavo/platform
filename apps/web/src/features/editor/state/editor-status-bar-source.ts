import type { LanguageServerDiagnosticSummary, LanguageServerStatus } from '@editor/language-server'
import type { ReactEditorController } from '@editor/react'

export type EditorStatusBarSource = {
  controller: ReactEditorController
  filePath: string
  languageServerDiagnostics: LanguageServerDiagnosticSummary | null
  languageServerStatus: LanguageServerStatus
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
    left.languageServerDiagnostics === right.languageServerDiagnostics &&
    left.languageServerStatus === right.languageServerStatus
  )
}
