import type { RpcEvent, RpcObservation } from '@workspace/client-core/transport/rpc-host'
import { isObservabilityActive } from '@workspace/observability'
import { createWideEventScope } from '@workspace/observability/scope'

export function createRpcObservation(instanceId: string): RpcObservation {
  function createScope(event: RpcEvent) {
    return createWideEventScope({
      enabled: isObservabilityActive(),
      base: { ...event, source: 'tui', runtime: 'tui', instanceId },
    })
  }

  return {
    createScope,
    async observeOperation(event, operation, summarize) {
      const scope = createScope(event)
      try {
        const result = await operation()
        scope.set({ outcome: 'success', ...summarize?.(result) })
        return result
      } catch (error) {
        scope.error(error)
        scope.set({ outcome: 'failed' })
        throw error
      } finally {
        scope.end()
      }
    },
  }
}
