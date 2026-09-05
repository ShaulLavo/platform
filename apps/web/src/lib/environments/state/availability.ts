import { useEnvironmentsStore } from '@/lib/environments/state/store'
import {
  createMachineUnavailableError,
  unavailableEnvironment,
} from '@/lib/environments/utils/availability'

export function assertEnvironmentWritable(origin: string) {
  const unavailable = unavailableEnvironment(useEnvironmentsStore.getState().entries[origin])
  if (unavailable) throw createMachineUnavailableError(unavailable)
}
