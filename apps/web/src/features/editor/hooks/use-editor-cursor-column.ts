import type { ReactEditorController } from '@singapor/react'
import { useEditorSelector } from '@singapor/react'

import { selectEditorCursorColumn } from '@/features/editor/state/editor-store-selectors'

export function useEditorCursorColumn(controller: ReactEditorController) {
  return useEditorSelector(controller, selectEditorCursorColumn)
}
