import { use } from 'react'

import { CommandContext } from '@/keymap/providers/command-context'
import { clientErrors } from '@/lib/structured-errors'

export function useCommand() {
  const context = use(CommandContext)
  if (context) return context

  throw clientErrors.CONTEXT_MISSING({
    message: 'useCommand must be used within CommandProvider',
  })
}
