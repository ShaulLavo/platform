import { useEditorLanguageServerStatus } from '@/features/editor/hooks/use-editor-language-server-status'
import type { EditorLanguageServerStatusSource } from '@/features/editor/state/editor-language-server-status-source'
import { formatLanguageServerStatus } from '@/features/editor/utils/status-formatters'

type EditorStatusLanguageServerProps = {
  source: EditorLanguageServerStatusSource
}

export function EditorStatusLanguageServer({ source }: EditorStatusLanguageServerProps) {
  const { diagnostics, status } = useEditorLanguageServerStatus(source)

  return <span className='tabular-nums'>{formatLanguageServerStatus(status, diagnostics)}</span>
}
