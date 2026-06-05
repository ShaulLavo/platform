import { createContext } from 'react'
import { type WorkspaceTerminalStoreApi } from '@/components/workspace/terminal/utils/workspace-terminal-store'

export const WorkspaceTerminalStateContext = createContext<WorkspaceTerminalStoreApi | null>(null)
