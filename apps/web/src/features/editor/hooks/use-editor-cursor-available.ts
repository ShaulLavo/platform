import type { ReactEditorController } from '@editor/react'
import { useEditorSelector } from '@editor/react'

import { selectEditorCursorAvailable } from '@/features/editor/state/editor-store-selectors'

export function useEditorCursorAvailable(controller: ReactEditorController) {
  return useEditorSelector(controller, selectEditorCursorAvailable)
}
