import { useWorkspaceTerminalState } from '@/components/workspace/terminal/hooks/use-workspace-terminal-state'

export function useWorkspaceTerminalCollapsed() {
  return useWorkspaceTerminalState((state) => state.terminalCollapsed)
}
