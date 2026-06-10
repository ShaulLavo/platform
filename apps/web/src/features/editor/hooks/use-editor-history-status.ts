import type { ReactEditorController } from '@singapor/react'
import { useEditorSelector } from '@singapor/react'

import { selectEditorHistoryStatus } from '@/features/editor/state/editor-store-selectors'

export function useEditorHistoryStatus(controller: ReactEditorController) {
  return useEditorSelector(controller, selectEditorHistoryStatus)
}
