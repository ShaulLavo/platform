import type { ReactEditorController } from '@editor/react'

import { EditorStatusCounterMetric } from '@/features/editor/components/editor-status-counter-metric'
import { EditorStatusCursorColumnValue } from '@/features/editor/components/editor-status-cursor-column-value'
import { EditorStatusCursorRowValue } from '@/features/editor/components/editor-status-cursor-row-value'
import { useEditorCursorAvailable } from '@/features/editor/hooks/use-editor-cursor-available'

type EditorStatusCursorProps = {
  controller: ReactEditorController
}

export function EditorStatusCursor({ controller }: EditorStatusCursorProps) {
  const available = useEditorCursorAvailable(controller)
  if (!available) return null

  return (
    <span className='inline-flex items-center gap-2'>
      <EditorStatusCounterMetric label='Ln'>
        <EditorStatusCursorRowValue controller={controller} />
      </EditorStatusCounterMetric>
      <EditorStatusCounterMetric label='Col'>
        <EditorStatusCursorColumnValue controller={controller} />
      </EditorStatusCounterMetric>
    </span>
  )
}
