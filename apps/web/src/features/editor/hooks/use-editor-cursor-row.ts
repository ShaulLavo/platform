import type { ReactEditorController } from '@singapor/react'
import { useEditorSelector } from '@singapor/react'

import { selectEditorCursorRow } from '@/features/editor/state/editor-store-selectors'

export function useEditorCursorRow(controller: ReactEditorController) {
  return useEditorSelector(controller, selectEditorCursorRow)
}
