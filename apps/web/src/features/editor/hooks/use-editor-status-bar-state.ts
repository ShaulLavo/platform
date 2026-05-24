import { useEffect, useRef } from 'react'

import type { EditorStatusBarState } from '@/features/editor/components/editor-status-bar'
import {
  formatHistoryStatus,
  formatSyntaxStatus,
  formatLanguageServerStatus,
} from '@/features/editor/utils/status-formatters'

type UseEditorStatusBarStateOptions = EditorStatusBarState & {
  onChange?: (state: EditorStatusBarState) => void
}

export function useEditorStatusBarState({ onChange, ...state }: UseEditorStatusBarStateOptions) {
  const key = editorStatusBarStateKey(state)
  const previousKey = useRef<string | null>(null)
  const previousOnChange = useRef<typeof onChange>(undefined)

  useEffect(() => {
    if (previousKey.current === key && previousOnChange.current === onChange) {
      return
    }

    previousKey.current = key
    previousOnChange.current = onChange
    onChange?.(state)
  }, [key, onChange, state])
}

function editorStatusBarStateKey(status: EditorStatusBarState) {
  const cursor = status.state?.documentId
    ? `${status.state.cursor.row}:${status.state.cursor.column}`
    : ''
  const syntax = formatSyntaxStatus(status.state)
  const history = formatHistoryStatus(status.state)
  const languageServer = formatLanguageServerStatus(
    status.languageServerStatus,
    status.languageServerDiagnostics,
  )

  return [status.filePath, status.charCount, cursor, syntax, history, languageServer].join('\u0000')
}
