import { use } from 'react'

import { CommandBusContext } from '@/keymap/providers/bus-context'
import { createClientInvariantError } from '@/lib/structured-errors'

export function useBusBinding() {
  const value = use(CommandBusContext)
  if (!value) throw createClientInvariantError('CommandBusProvider is missing')
  return value
}
