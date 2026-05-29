import { useWorkspaceTerminalState } from './use-workspace-terminal-state'

export function useWorkspaceTerminalToggle() {
  return useWorkspaceTerminalState((state) => state.toggleTerminal)
}
