import { inProcessOrchestrationSocketFactory } from '@workspace/client-core/test/in-process-orchestration-socket'

import { createSettingsSession } from '@/connection/state/session'
import { createRpcObservation } from '@/host/observation'
import { createInProcessClient } from '../client'
import type { TestServer } from '../server'

export function createTestSettingsSession(
  server: TestServer,
  options: Partial<Parameters<typeof createSettingsSession>[0]> = {},
) {
  return createSettingsSession({
    origin: server.origin,
    storageDirectory: `${server.root}/tui`,
    client: createInProcessClient(server),
    createSocket: inProcessOrchestrationSocketFactory(server),
    observation: createRpcObservation('tui-session-test'),
    ...options,
  })
}
