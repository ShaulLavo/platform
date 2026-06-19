import { use } from 'react'

import { ChatTimelineActionsContext } from '@/features/chat/providers/timeline-actions-context'
import { clientErrors } from '@/lib/structured-errors'

export function useChatTimelineActions() {
  const actions = use(ChatTimelineActionsContext)
  if (!actions) {
    throw clientErrors.CONTEXT_MISSING({
      message: 'useChatTimelineActions must be used within ChatTimelineActionsContext',
    })
  }

  return actions
}
