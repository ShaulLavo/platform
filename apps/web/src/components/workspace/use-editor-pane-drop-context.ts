import { use } from 'react'

import { EditorPaneDropContext } from '@/components/workspace/editor-pane-drop-context'
import { clientErrors } from '@/lib/structured-errors'

export function useEditorPaneDropContext() {
  const context = use(EditorPaneDropContext)
  if (!context) {
    throw clientErrors.CONTEXT_MISSING({
      message: 'useEditorPaneDropContext must be used within FileViewer',
    })
  }

  return context
}
