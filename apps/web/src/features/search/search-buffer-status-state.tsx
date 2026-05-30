import type { SearchBufferStatus } from '@/features/search/search-buffer-state'
import { SearchErrorState } from '@/features/search/search-error-state'
import { SearchIdleState } from '@/features/search/search-idle-state'
import { SearchPendingOrEmpty } from '@/features/search/search-pending-or-empty'

export function SearchBufferStatusState({
  error,
  status,
}: {
  error: string | null
  status: SearchBufferStatus
}) {
  if (status === 'idle') {
    return <SearchIdleState />
  }
  if (status === 'error') {
    return <SearchErrorState message={error} />
  }

  return <SearchPendingOrEmpty status={status} />
}
