import { use, useSyncExternalStore } from 'react'
import { EnvironmentConnectionsContext } from '@/providers/environment-connections-context'
import { createClientInvariantError } from '@/lib/structured-errors'

export function useEnvironmentConnections() {
  const connections = use(EnvironmentConnectionsContext)
  if (!connections)
    throw createClientInvariantError('Machines require EnvironmentTransportsProvider.')
  const snapshot = useSyncExternalStore(connections.store.subscribe, connections.store.getState)
  return { ...connections, machines: snapshot.machines }
}
