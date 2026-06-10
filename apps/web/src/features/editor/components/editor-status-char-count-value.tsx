import type { ReactEditorController } from '@singapor/react'

import { EditorStatusCounterValue } from '@/features/editor/components/editor-status-counter-value'
import { useEditorCharCount } from '@/features/editor/hooks/use-editor-char-count'

type EditorStatusCharCountValueProps = {
  controller: ReactEditorController
}

export function EditorStatusCharCountValue({ controller }: EditorStatusCharCountValueProps) {
  const charCount = useEditorCharCount(controller)

  return <EditorStatusCounterValue includeCommas value={charCount} />
}
