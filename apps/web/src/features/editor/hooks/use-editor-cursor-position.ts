import type { ReactEditorController } from '@editor/react'
import { useEditorSelector } from '@editor/react'

import {
  editorCursorPositionsEqual,
  selectEditorCursorPosition,
} from '@/features/editor/state/editor-store-selectors'

export function useEditorCursorPosition(controller: ReactEditorController) {
  return useEditorSelector(controller, selectEditorCursorPosition, editorCursorPositionsEqual)
}
