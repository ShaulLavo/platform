import type { ReactEditorController } from '@singapor/react'
import { useEditorSelector } from '@singapor/react'

import { selectEditorCursorAvailable } from '@/features/editor/state/editor-store-selectors'

export function useEditorCursorAvailable(controller: ReactEditorController) {
  return useEditorSelector(controller, selectEditorCursorAvailable)
}
