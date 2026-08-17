import { WarningCircleIcon } from '@phosphor-icons/react'
import { EmptyState } from '@workspace/ui/components/empty-state'

import type { SearchBufferStatus } from '@/features/search/state/buffer-state'
import { SearchIdleState } from '@/features/search/components/idle-state'
import { SearchPendingOrEmpty } from '@/features/search/components/pending-or-empty'

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
    return (
      <EmptyState
        description={error ?? 'Search failed.'}
        icon={<WarningCircleIcon className='size-6' weight='duotone' />}
        title='Search failed'
        tone='error'
      />
    )
  }

  return <SearchPendingOrEmpty status={status} />
}
