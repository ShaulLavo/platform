import { canonicalServerOrigin, environmentClientFor } from '@/lib/client'
import { createThreadDetailSubscriptionCache } from '@/features/chat/state/thread-detail-subscriptions'
import { createThreadEarlierPageLoader } from '@/features/chat/state/thread-earlier-pages'
import type { ChatTransport } from '@/features/chat/transport/chat-transport'
import { fetchOrchestrationThreadDetailSnapshotHttp } from '@/features/chat/transport/orchestration-http-snapshots'
import {
  OrchestrationRpcClient,
  type OrchestrationRpcClientOptions,
} from '@/features/chat/transport/orchestration-rpc-client'
import { createOrchestrationRpcClosedError } from '@/features/chat/transport/structured-errors'

export function createChatTransport(
  origin: string,
  options: Omit<OrchestrationRpcClientOptions, 'origin'> = {},
): ChatTransport {
  origin = canonicalServerOrigin(origin)
  const client = environmentClientFor(origin)
  const rpc = new OrchestrationRpcClient({ ...options, origin })
  const lifetime = new AbortController()
  const cache = createThreadDetailSubscriptionCache({ transport: rpc })
  const pages = createThreadEarlierPageLoader({ transport: rpc })

  return {
    get closed() {
      return rpc.closed
    },
    close() {
      if (rpc.closed) return
      cache.disposeAll()
      pages.dispose()
      lifetime.abort(createOrchestrationRpcClosedError())
      rpc.close()
    },
    dispatchCommand: rpc.dispatchCommand.bind(rpc),
    replayEvents: rpc.replayEvents.bind(rpc),
    shellStream: rpc.shellStream.bind(rpc),
    threadDetailPage: rpc.threadDetailPage.bind(rpc),
    threadDetailStream: rpc.threadDetailStream.bind(rpc),
    retainThreadDetail: cache.retain,
    loadEarlierPage: pages.load,
    async threadDetailSnapshot(threadId) {
      lifetime.signal.throwIfAborted()
      return fetchOrchestrationThreadDetailSnapshotHttp(threadId, client, lifetime.signal)
    },
  }
}
