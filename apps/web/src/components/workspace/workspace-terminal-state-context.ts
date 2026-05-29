import { createContext } from 'react'
import { type WorkspaceTerminalStoreApi } from './workspace-terminal-store'

export const WorkspaceTerminalStateContext = createContext<WorkspaceTerminalStoreApi | null>(null)
