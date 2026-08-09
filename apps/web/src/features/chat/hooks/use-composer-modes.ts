import { use } from 'react'

import { ChatComposerModesContext } from '@/features/chat/providers/composer-modes-context'
import { clientErrors } from '@/lib/structured-errors'

export function useComposerModes() {
  const modes = use(ChatComposerModesContext)
  if (!modes) {
    throw clientErrors.CONTEXT_MISSING({
      message: 'useComposerModes must be used within ChatComposerModesProvider',
    })
  }

  return modes
}
