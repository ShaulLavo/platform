import {
  createTerminalStore,
  type TerminalStoreApi,
} from '@/components/workspace/terminal/utils/terminal-store'
import { TerminalStateContext } from '@/components/workspace/terminal/providers/terminal-state-context'
import { createElement, useRef, type ReactNode } from 'react'

export function TerminalStateProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<TerminalStoreApi | null>(null)
  storeRef.current ??= createTerminalStore()

  return createElement(TerminalStateContext, { value: storeRef.current }, children)
}
