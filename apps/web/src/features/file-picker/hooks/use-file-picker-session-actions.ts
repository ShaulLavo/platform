import { use } from 'react'

import { FilePickerSessionActionsContext } from '@/features/file-picker/providers/session-actions-context'
import { clientErrors } from '@/lib/structured-errors'

export function useFilePickerSessionActions() {
  const actions = use(FilePickerSessionActionsContext)
  if (!actions) {
    throw clientErrors.CONTEXT_MISSING({
      message: 'useFilePickerSessionActions must be used within FilePickerSessionActionsContext',
    })
  }

  return actions
}
