import { use } from 'react'

import { CommandPaletteActionsContext } from '@/components/command-palette/providers/actions-context'
import { clientErrors } from '@/lib/structured-errors'

export function useCommandPaletteActions() {
  const actions = use(CommandPaletteActionsContext)
  if (!actions) {
    throw clientErrors.CONTEXT_MISSING({
      message: 'useCommandPaletteActions must be used within CommandPaletteActionsContext',
    })
  }

  return actions
}
