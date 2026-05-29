import type { ReactEditorController } from '@editor/react'
import { useEditorSelector } from '@editor/react'

import { selectEditorCursorRow } from '@/features/editor/state/editor-store-selectors'

export function useEditorCursorRow(controller: ReactEditorController) {
  return useEditorSelector(controller, selectEditorCursorRow)
}
