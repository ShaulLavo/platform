import type { ReactEditorController } from '@editor/react'

import { EditorStatusCounterMetric } from '@/features/editor/components/editor-status-counter-metric'
import { useEditorCharCount } from '@/features/editor/hooks/use-editor-char-count'

type EditorStatusCharCountProps = {
  controller: ReactEditorController
}

export function EditorStatusCharCount({ controller }: EditorStatusCharCountProps) {
  const charCount = useEditorCharCount(controller)

  return (
    <EditorStatusCounterMetric
      includeCommas
      label='chars'
      labelPosition='after'
      value={charCount}
    />
  )
}
