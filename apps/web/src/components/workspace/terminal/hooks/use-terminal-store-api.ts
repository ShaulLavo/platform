import { TerminalStateContext } from '@/components/workspace/terminal/providers/terminal-state-context'
import { clientErrors } from '@/lib/structured-errors'
import { use } from 'react'

export function useTerminalStoreApi() {
  const store = use(TerminalStateContext)
  if (!store) {
    throw clientErrors.CONTEXT_MISSING({
      message: 'useTerminalState must be used within TerminalStateProvider',
    })
  }

  return store
}
