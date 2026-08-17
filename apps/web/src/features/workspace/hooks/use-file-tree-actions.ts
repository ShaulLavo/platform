import { use } from 'react'

import { FileTreeActionsContext } from '@/features/workspace/providers/actions-context'
import { clientErrors } from '@/lib/structured-errors'

export function useFileTreeActions() {
  const actions = use(FileTreeActionsContext)
  if (!actions) {
    throw clientErrors.CONTEXT_MISSING({
      message: 'useFileTreeActions must be used within FileTreeActionsContext',
    })
  }

  return actions
}
