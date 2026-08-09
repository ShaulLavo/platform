import { use } from 'react'

import { ChatPendingRequestsContext } from '@/features/chat/providers/pending-requests-context'
import { clientErrors } from '@/lib/structured-errors'

export function usePendingRequests() {
  const pendingRequests = use(ChatPendingRequestsContext)
  if (!pendingRequests) {
    throw clientErrors.CONTEXT_MISSING({
      message: 'usePendingRequests must be used within ChatPendingRequestsProvider',
    })
  }

  return pendingRequests
}
