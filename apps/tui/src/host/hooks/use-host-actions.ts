import { useContext } from 'react'
import { HostActionsContext } from '@/host/providers/actions-context'
import { createTuiError } from '@/host/utils/structured-errors'

export function useHostActions() {
  const actions = useContext(HostActionsContext)
  if (actions) return actions
  throw createTuiError(
    'Terminal actions are unavailable.',
    'Mount the application inside its host action provider.',
  )
}
