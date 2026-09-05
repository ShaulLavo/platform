import { useEffect, type ReactNode } from 'react'
import { useSettingsProjection } from '@/features/settings/hooks/use-settings-projection'
import { EnvironmentConnectionsContext } from '@/providers/environment-connections-context'
import type { EnvironmentConnections } from '@/state/environment-connections'

export function EnvironmentTransportsProvider({
  connections,
  children,
}: {
  readonly connections: EnvironmentConnections
  readonly children: ReactNode
}) {
  const machines = useSettingsProjection()?.values['environments.machines']
  useEffect(() => {
    connections.start()
    return connections.stop
  }, [connections])
  useEffect(() => {
    if (machines) connections.configureMachines(machines)
  }, [connections, machines])
  return (
    <EnvironmentConnectionsContext value={connections}>{children}</EnvironmentConnectionsContext>
  )
}
