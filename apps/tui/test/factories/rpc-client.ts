import { createEnvironmentsStore } from '@workspace/client-core/environments/state/store'
import { inProcessOrchestrationSocketFactory } from '@workspace/client-core/test/in-process-orchestration-socket'
import { OrchestrationRpcClient } from '@workspace/client-core/transport/orchestration-rpc-client'

import { createRpcObservation } from '@/host/observation'
import type { TestServer } from '../server'

export function createTestRpcClient({
  server,
  clientOrigin = server.clientOrigin,
}: {
  readonly server: TestServer
  readonly clientOrigin?: string
}) {
  const environments = createEnvironmentsStore({ primaryOrigin: server.origin })
  const rpc = new OrchestrationRpcClient({
    origin: server.origin,
    environments,
    createSocket: inProcessOrchestrationSocketFactory({
      get app() {
        return server.app
      },
      clientOrigin,
    }),
    observation: createRpcObservation('tui-rpc-test'),
  })
  return { rpc, environments }
}
