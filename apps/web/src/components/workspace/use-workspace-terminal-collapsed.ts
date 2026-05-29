import { useWorkspaceTerminalState } from './use-workspace-terminal-state'

export function useWorkspaceTerminalCollapsed() {
  return useWorkspaceTerminalState((state) => state.terminalCollapsed)
}
