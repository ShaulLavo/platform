import { useWorkspaceTerminalState } from './use-workspace-terminal-state'

export function useWorkspaceTerminalResizeHandler() {
  return useWorkspaceTerminalState((state) => state.handleTerminalResize)
}
