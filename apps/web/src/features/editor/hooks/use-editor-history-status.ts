import type { ReactEditorController } from '@editor/react'
import { useEditorSelector } from '@editor/react'

import { selectEditorHistoryStatus } from '@/features/editor/state/editor-store-selectors'

export function useEditorHistoryStatus(controller: ReactEditorController) {
  return useEditorSelector(controller, selectEditorHistoryStatus)
}
