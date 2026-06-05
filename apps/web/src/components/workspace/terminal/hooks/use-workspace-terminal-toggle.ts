import { useWorkspaceTerminalState } from '@/components/workspace/terminal/hooks/use-workspace-terminal-state'

export function useWorkspaceTerminalToggle() {
  return useWorkspaceTerminalState((state) => state.toggleTerminal)
}
