import type { ReactEditorController } from '@singapor/react'
import { useEditorSelector } from '@singapor/react'

import { selectEditorSyntaxStatus } from '@/features/editor/state/editor-store-selectors'

export function useEditorSyntaxStatus(controller: ReactEditorController) {
  return useEditorSelector(controller, selectEditorSyntaxStatus)
}
