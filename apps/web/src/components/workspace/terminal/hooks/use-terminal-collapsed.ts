import { useTerminalState } from '@/components/workspace/terminal/hooks/use-terminal-state'

export function useTerminalCollapsed() {
  return useTerminalState((state) => state.terminalCollapsed)
}
