import type { EditorState } from '@singapor/core'
import type { LanguageServerDiagnosticSummary, LanguageServerStatus } from '@singapor/lsp-plugin'

export function formatSyntaxStatus(state: EditorState | null) {
  if (!state?.documentId) return 'Plain text'

  const language = state.languageId ?? 'Plain text'
  if (state.syntaxStatus === 'plain') return language

  return `${language} ${state.syntaxStatus}`
}

export function formatHistoryStatus(state: EditorState | null) {
  if (!state?.documentId) return ''

  return `${state.canUndo ? 'Undo' : 'No undo'} / ${state.canRedo ? 'Redo' : 'No redo'}`
}

export function formatLanguageServerStatus(
  status: LanguageServerStatus,
  summary: LanguageServerDiagnosticSummary | null,
) {
  if (status === 'idle') return ''
  if (status === 'loading') return 'LSP loading'
  if (status === 'error') return 'LSP error'
  if (!summary || summary.counts.total === 0) return 'LSP ready'

  const parts = [
    countLabel(summary.counts.error, 'error'),
    countLabel(summary.counts.warning, 'warning'),
    countLabel(summary.counts.information, 'info'),
    countLabel(summary.counts.hint, 'hint'),
  ].filter(Boolean)
  return `LSP ${parts.join(', ')}`
}

function countLabel(count: number, label: string) {
  if (count === 0) return ''
  if (count === 1) return `1 ${label}`

  return `${count} ${label}s`
}
