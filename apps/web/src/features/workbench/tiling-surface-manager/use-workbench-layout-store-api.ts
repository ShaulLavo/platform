import { use } from 'react'

import { clientErrors } from '@/lib/structured-errors'
import { WorkbenchLayoutStateContext } from './workbench-layout-context'

export function useWorkbenchLayoutStoreApi() {
  const store = use(WorkbenchLayoutStateContext)
  if (!store) {
    throw clientErrors.CONTEXT_MISSING({
      message: 'useWorkbenchLayoutStoreApi must be used within WorkbenchLayoutProvider',
    })
  }

  return store
}
