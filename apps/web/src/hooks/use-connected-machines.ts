import { useEnvironmentsStore } from '@/lib/environments/state/store'
import { connectedMachines } from '@/lib/environments/utils/machines'
import { useEnvironmentConnections } from '@/hooks/use-environment-connections'

export function useConnectedMachines() {
  const { machines } = useEnvironmentConnections()
  const entries = useEnvironmentsStore((state) => state.entries)
  return connectedMachines(entries).filter(
    (entry) =>
      entry.kind === 'primary' ||
      machines.some((machine) => machine.environmentId === entry.environmentId),
  )
}
