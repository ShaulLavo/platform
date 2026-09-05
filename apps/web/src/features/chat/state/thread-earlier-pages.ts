import type { ThreadId } from '@workspace/contracts'

import { errorMessage } from '@/lib/error-message'
import type { ChatTransport } from '@/features/chat/transport/chat-transport'
import { createChatPipelineScope } from '@/features/chat/utils/pipeline-logging'
import { chatThreadEarlierPageInput, selectChatThreadHasEarlier } from './chat-projection-selectors'
import { useChatProjectionStore, type ChatProjectionStore } from './chat-projection-store'
import { useThreadEarlierPageStore } from './thread-earlier-page-store'

type ChatProjectionStoreAccess = {
  getState: () => ChatProjectionStore
}

export type ThreadEarlierPageLoader = {
  load: (threadId: ThreadId) => Promise<boolean>
  dispose(): void
}

/**
 * Walks a thread backwards one page at a time.
 *
 * The boundary is read imperatively at request time rather than captured when
 * the affordance rendered: a live append or a reconnect between the click and
 * the request must not make the walk skip rows or re-fetch the same page.
 */
export function createThreadEarlierPageLoader({
  transport,
  store = useChatProjectionStore,
}: {
  transport: Pick<ChatTransport, 'threadDetailPage'>
  store?: ChatProjectionStoreAccess
}): ThreadEarlierPageLoader {
  let disposed = false
  const inFlight = new Map<ThreadId, Promise<boolean>>()

  async function loadPage(threadId: ThreadId) {
    const scope = createChatPipelineScope('chat.thread_earlier_page.summary', { threadId })
    const pageStore = useThreadEarlierPageStore.getState()
    pageStore.setThreadEarlierPage(threadId, { error: null, pending: true })

    try {
      const page = await transport.threadDetailPage(
        chatThreadEarlierPageInput(store.getState(), threadId),
      )
      if (disposed) return false
      store.getState().prependThreadDetailPage(page)
      scope.set({
        activityCount: page.activities.length,
        hasEarlier: page.hasEarlier,
        messageCount: page.messages.length,
        outcome: 'ok',
      })
      useThreadEarlierPageStore
        .getState()
        .setThreadEarlierPage(threadId, { error: null, pending: false })

      return true
    } catch (error) {
      if (disposed) return false
      const message = errorMessage(error, 'Earlier messages could not be loaded.')
      scope.error(error)
      scope.set({ outcome: 'error' })
      useThreadEarlierPageStore
        .getState()
        .setThreadEarlierPage(threadId, { error: message, pending: false })

      return false
    } finally {
      scope.end({})
      inFlight.delete(threadId)
    }
  }

  return {
    dispose: () => {
      disposed = true
      for (const threadId of inFlight.keys()) {
        useThreadEarlierPageStore.getState().clearThreadEarlierPage(threadId)
      }
      inFlight.clear()
    },
    load: (threadId) => {
      if (disposed) return Promise.resolve(false)
      // Exhausted threads answer without a round trip: the affordance can lag a
      // frame behind the last page, and a double-click must not cost two scans.
      if (!selectChatThreadHasEarlier(store.getState(), threadId)) return Promise.resolve(false)

      const existing = inFlight.get(threadId)
      if (existing) return existing

      const request = loadPage(threadId)
      inFlight.set(threadId, request)

      return request
    },
  }
}
