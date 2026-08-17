import { use } from 'react'

import { EditorTabActionsContext } from '@/features/editor/providers/tab-actions-context'
import { clientErrors } from '@/lib/structured-errors'

export function useEditorTabActions() {
  const actions = use(EditorTabActionsContext)
  if (!actions) {
    throw clientErrors.CONTEXT_MISSING({
      message: 'useEditorTabActions must be used within EditorTabActionsProvider',
    })
  }

  return actions
}
