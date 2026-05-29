import type { ReactEditorController } from '@editor/react'
import { useEditorSelector } from '@editor/react'

import { selectEditorCursorColumn } from '@/features/editor/state/editor-store-selectors'

export function useEditorCursorColumn(controller: ReactEditorController) {
  return useEditorSelector(controller, selectEditorCursorColumn)
}
