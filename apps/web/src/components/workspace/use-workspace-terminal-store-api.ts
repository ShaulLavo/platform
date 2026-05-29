import { WorkspaceTerminalStateContext } from './workspace-terminal-state-context'
import { clientErrors } from '@/lib/structured-errors'
import { use } from 'react'

export function useWorkspaceTerminalStoreApi() {
  const store = use(WorkspaceTerminalStateContext)
  if (!store) {
    throw clientErrors.CONTEXT_MISSING({
      message: 'useWorkspaceTerminalState must be used within WorkspaceTerminalStateProvider',
    })
  }

  return store
}
