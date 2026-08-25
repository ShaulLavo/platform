import { use } from 'react'

import { FocusServiceContext } from '@/lib/focus/providers/context'
import { clientErrors } from '@/lib/structured-errors'

export function useFocusService() {
  const service = use(FocusServiceContext)
  if (service) return service

  throw clientErrors.CONTEXT_MISSING({
    message: 'useFocusService must be used within FocusProvider',
  })
}
