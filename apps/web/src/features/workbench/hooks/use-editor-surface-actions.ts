import { use } from 'react'

import { EditorSurfaceActionsContext } from '@/features/workbench/providers/editor-surface-actions-context'
import { clientErrors } from '@/lib/structured-errors'

export function useEditorSurfaceActions() {
  const actions = use(EditorSurfaceActionsContext)
  if (!actions) {
    throw clientErrors.CONTEXT_MISSING({
      message: 'useEditorSurfaceActions must be used within EditorSurfaceActionsContext',
    })
  }

  return actions
}
