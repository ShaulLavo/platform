import { useWorkspaceTerminalStoreApi } from '@/components/workspace/terminal/hooks/use-workspace-terminal-store-api'
import { type WorkspaceTerminalStore } from '@/components/workspace/terminal/utils/workspace-terminal-store'
import { useStore } from 'zustand'

export function useWorkspaceTerminalState<T>(selector: (state: WorkspaceTerminalStore) => T): T {
  return useStore(useWorkspaceTerminalStoreApi(), selector)
}
