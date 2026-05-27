import type { SearchBufferStatus } from '@/features/search/search-buffer-state'
import {
  SearchErrorState,
  SearchIdleState,
  SearchPendingOrEmpty,
} from '@/features/search/search-status-states'

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
