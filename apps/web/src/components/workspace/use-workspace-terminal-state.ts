import { useWorkspaceTerminalStoreApi } from './use-workspace-terminal-store-api'
import { type WorkspaceTerminalStore } from './workspace-terminal-store'
import { useStore } from 'zustand'

export function useWorkspaceTerminalState<T>(selector: (state: WorkspaceTerminalStore) => T): T {
  return useStore(useWorkspaceTerminalStoreApi(), selector)
}
