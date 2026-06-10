import type { ReactEditorController } from '@singapor/react'

import { EditorStatusCounterValue } from '@/features/editor/components/editor-status-counter-value'
import { useEditorCursorColumn } from '@/features/editor/hooks/use-editor-cursor-column'

type EditorStatusCursorColumnValueProps = {
  controller: ReactEditorController
}

export function EditorStatusCursorColumnValue({ controller }: EditorStatusCursorColumnValueProps) {
  const column = useEditorCursorColumn(controller)
  if (column === null) return null

  return <EditorStatusCounterValue value={column + 1} />
}
