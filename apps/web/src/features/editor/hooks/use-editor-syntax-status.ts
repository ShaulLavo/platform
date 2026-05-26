import type { ReactEditorController } from '@editor/react'
import { useEditorSelector } from '@editor/react'

import { selectEditorSyntaxStatus } from '@/features/editor/state/editor-store-selectors'

export function useEditorSyntaxStatus(controller: ReactEditorController) {
  return useEditorSelector(controller, selectEditorSyntaxStatus)
}
