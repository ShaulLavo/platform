import { createContext } from 'react'
import type { EnvironmentConnections } from '@/state/environment-connections'

export const EnvironmentConnectionsContext = createContext<EnvironmentConnections | null>(null)
