import { createContext } from 'react'
import { type TerminalStoreApi } from '@/components/workspace/terminal/utils/terminal-store'

export const TerminalStateContext = createContext<TerminalStoreApi | null>(null)
