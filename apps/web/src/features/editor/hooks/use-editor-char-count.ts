import type { ReactEditorController } from '@singapor/react'
import { useEditorSelector } from '@singapor/react'

import { selectEditorCharCount } from '@/features/editor/state/editor-store-selectors'

export function useEditorCharCount(controller: ReactEditorController) {
  return useEditorSelector(controller, selectEditorCharCount)
}
