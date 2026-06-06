import { use } from 'react'

import { clientErrors } from '@/lib/structured-errors'
import { LayoutStateContext } from '@/features/workbench/providers/layout-context'

export function useLayoutStoreApi() {
  const store = use(LayoutStateContext)
  if (!store) {
    throw clientErrors.CONTEXT_MISSING({
      message: 'useLayoutStoreApi must be used within LayoutProvider',
    })
  }

  return store
}
