import type { ReactEditorController } from '@editor/react'

import { EditorStatusCounterMetric } from '@/features/editor/components/editor-status-counter-metric'
import { useEditorCursorPosition } from '@/features/editor/hooks/use-editor-cursor-position'

type EditorStatusCursorProps = {
  controller: ReactEditorController
}

export function EditorStatusCursor({ controller }: EditorStatusCursorProps) {
  const cursor = useEditorCursorPosition(controller)
  if (!cursor) return null

  return (
    <span className='inline-flex items-center gap-2'>
      <EditorStatusCounterMetric label='Ln' value={cursor.row + 1} />
      <EditorStatusCounterMetric label='Col' value={cursor.column + 1} />
    </span>
  )
}
