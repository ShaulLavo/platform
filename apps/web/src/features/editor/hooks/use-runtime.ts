import { use } from 'react'

import { EditorRuntimeContext } from '@/features/editor/providers/runtime-context'
import { clientErrors } from '@/lib/structured-errors'

export function useEditorRuntime() {
  const runtime = use(EditorRuntimeContext)
  if (runtime) return runtime

  throw clientErrors.CONTEXT_MISSING({
    message: 'useEditorRuntime must be used within EditorStateProvider',
  })
}
