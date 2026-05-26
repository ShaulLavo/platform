import type { ReactEditorController } from '@editor/react'

import { useEditorHistoryStatus } from '@/features/editor/hooks/use-editor-history-status'

type EditorStatusHistoryProps = {
  controller: ReactEditorController
}

export function EditorStatusHistory({ controller }: EditorStatusHistoryProps) {
  const historyStatus = useEditorHistoryStatus(controller)

  return <span>{historyStatus}</span>
}
