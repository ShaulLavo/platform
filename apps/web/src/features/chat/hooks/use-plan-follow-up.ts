import { use } from 'react'

import { ChatPlanFollowUpContext } from '@/features/chat/providers/plan-follow-up-context'
import { clientErrors } from '@/lib/structured-errors'

export function usePlanFollowUp() {
  const followUp = use(ChatPlanFollowUpContext)
  if (!followUp) {
    throw clientErrors.CONTEXT_MISSING({
      message: 'usePlanFollowUp must be used within ChatPlanFollowUpProvider',
    })
  }

  return followUp
}
