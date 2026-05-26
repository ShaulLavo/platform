import type { ReactEditorController } from '@editor/react'
import { useEditorSelector } from '@editor/react'

import { selectEditorCharCount } from '@/features/editor/state/editor-store-selectors'

export function useEditorCharCount(controller: ReactEditorController) {
  return useEditorSelector(controller, selectEditorCharCount)
}
