import type { ReactEditorController } from '@editor/react'

import { EditorStatusCounterValue } from '@/features/editor/components/editor-status-counter-value'
import { useEditorCursorRow } from '@/features/editor/hooks/use-editor-cursor-row'

type EditorStatusCursorRowValueProps = {
  controller: ReactEditorController
}

export function EditorStatusCursorRowValue({ controller }: EditorStatusCursorRowValueProps) {
  const row = useEditorCursorRow(controller)
  if (row === null) return null

  return <EditorStatusCounterValue value={row + 1} />
}
