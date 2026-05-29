import { useWorkspaceTerminalState } from './use-workspace-terminal-state'

export function useWorkspaceTerminalPanelRef() {
  return useWorkspaceTerminalState((state) => state.terminalPanelRef)
}
