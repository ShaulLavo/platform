import { use } from 'react'

import { SearchResultActionsContext } from '@/features/search/providers/result-actions-context'
import { clientErrors } from '@/lib/structured-errors'

export function useSearchResultActions() {
  const actions = use(SearchResultActionsContext)
  if (!actions) {
    throw clientErrors.CONTEXT_MISSING({
      message: 'useSearchResultActions must be used within SearchResultActionsContext',
    })
  }

  return actions
}
