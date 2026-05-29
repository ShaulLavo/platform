import {
  createWorkspaceTerminalStore,
  type WorkspaceTerminalStoreApi,
} from './workspace-terminal-store'
import { WorkspaceTerminalStateContext } from './workspace-terminal-state-context'
import { createElement, useRef, type ReactNode } from 'react'

export function WorkspaceTerminalStateProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<WorkspaceTerminalStoreApi | null>(null)
  storeRef.current ??= createWorkspaceTerminalStore()

  return createElement(WorkspaceTerminalStateContext, { value: storeRef.current }, children)
}
