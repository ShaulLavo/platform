import { use } from 'react'

import { clientErrors } from '@/lib/structured-errors'

import { EditorSurfaceContext } from '@/features/workbench/providers/editor-surface-context'

export function useEditorSurfaceContext() {
  const context = use(EditorSurfaceContext)
  if (!context) {
    throw clientErrors.CONTEXT_MISSING({
      message: 'useEditorSurfaceContext must be used within EditorSurfaceProvider',
    })
  }

  return context
}
