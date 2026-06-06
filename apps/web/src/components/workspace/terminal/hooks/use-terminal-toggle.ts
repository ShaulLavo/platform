import { useTerminalState } from '@/components/workspace/terminal/hooks/use-terminal-state'

export function useTerminalToggle() {
  return useTerminalState((state) => state.toggleTerminal)
}
