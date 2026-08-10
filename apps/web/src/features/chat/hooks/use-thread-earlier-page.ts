import type { ThreadId } from '@workspace/contracts'
import { useCallback } from 'react'

import { selectChatThreadHasEarlier } from '../state/chat-projection-selectors'
import { useChatProjectionStore } from '../state/chat-projection-store'
import { loadEarlierChatThreadPage } from '../state/thread-earlier-pages'
import {
  selectThreadEarlierPage,
  useThreadEarlierPageStore,
} from '../state/thread-earlier-page-store'

/** Everything the timeline needs to offer, run and report one backwards page. */
export function useThreadEarlierPage(threadId: ThreadId | null | undefined) {
  const hasEarlier = useChatProjectionStore((state) => selectChatThreadHasEarlier(state, threadId))
  const { error, pending } = useThreadEarlierPageStore((state) =>
    selectThreadEarlierPage(state, threadId),
  )
  const loadEarlier = useCallback(() => {
    if (!threadId) return

    void loadEarlierChatThreadPage(threadId)
  }, [threadId])

  return { error, hasEarlier, loadEarlier, pending }
}
