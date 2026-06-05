import { use } from 'react'

import { clientErrors } from '@/lib/structured-errors'

import { WorkbenchEditorSurfaceContext } from './workbench-editor-surface-context'

export function useWorkbenchEditorSurfaceContext() {
  const context = use(WorkbenchEditorSurfaceContext)
  if (!context) {
    throw clientErrors.CONTEXT_MISSING({
      message:
        'useWorkbenchEditorSurfaceContext must be used within WorkbenchEditorSurfaceProvider',
    })
  }

  return context
}
