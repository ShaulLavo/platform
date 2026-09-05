import type { Machines } from '@workspace/contracts'
import { createEnvironmentConnections } from '@/state/environment-connections'
import type { PlatformBridge } from '@/lib/platform/bridge'

export function createTestEnvironmentConnections(machines: Machines = {}) {
  const connections = createEnvironmentConnections({ activateEnvironment: () => {} })
  connections.configureMachines(machines)
  return connections
}

export function createTestMachineBridge(
  connectMachine: PlatformBridge['connectMachine'],
): PlatformBridge {
  return {
    backdrop: 'app',
    pickEntry: async () => [],
    connectMachine,
    disconnectMachine: async () => {},
    onMachineState: () => () => {},
  }
}
