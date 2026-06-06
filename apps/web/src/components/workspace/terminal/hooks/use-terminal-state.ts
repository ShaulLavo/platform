import { useTerminalStoreApi } from '@/components/workspace/terminal/hooks/use-terminal-store-api'
import { type TerminalStore } from '@/components/workspace/terminal/utils/terminal-store'
import { useStore } from 'zustand'

export function useTerminalState<T>(selector: (state: TerminalStore) => T): T {
  return useStore(useTerminalStoreApi(), selector)
}
