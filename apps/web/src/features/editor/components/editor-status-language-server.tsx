import type { LanguageServerDiagnosticSummary, LanguageServerStatus } from '@editor/language-server'

import { formatLanguageServerStatus } from '@/features/editor/utils/status-formatters'

type EditorStatusLanguageServerProps = {
  diagnostics: LanguageServerDiagnosticSummary | null
  status: LanguageServerStatus
}

export function EditorStatusLanguageServer({
  diagnostics,
  status,
}: EditorStatusLanguageServerProps) {
  return <span>{formatLanguageServerStatus(status, diagnostics)}</span>
}
