import { use } from 'react'

import { ProviderSignInDialogContext } from '@/features/chat/providers/provider-sign-in-context'
import { clientErrors } from '@/lib/structured-errors'

export function useProviderSignInDialog() {
  const dialog = use(ProviderSignInDialogContext)
  if (!dialog) {
    throw clientErrors.CONTEXT_MISSING({
      message: 'useProviderSignInDialog must be used within ProviderSignInDialogContext',
    })
  }

  return dialog
}
