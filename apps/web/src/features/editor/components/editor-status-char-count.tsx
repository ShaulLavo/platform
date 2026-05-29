import type { ReactEditorController } from '@editor/react'

import { EditorStatusCharCountValue } from '@/features/editor/components/editor-status-char-count-value'
import { EditorStatusCounterMetric } from '@/features/editor/components/editor-status-counter-metric'

type EditorStatusCharCountProps = {
  controller: ReactEditorController
}

export function EditorStatusCharCount({ controller }: EditorStatusCharCountProps) {
  return (
    <EditorStatusCounterMetric label='chars' labelPosition='after'>
      <EditorStatusCharCountValue controller={controller} />
    </EditorStatusCounterMetric>
  )
}
