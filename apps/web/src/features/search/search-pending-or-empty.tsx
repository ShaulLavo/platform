import { CircleNotchIcon } from '@phosphor-icons/react'

import type { SearchBufferStatus } from '@/features/search/search-buffer-state'
import { SearchCenteredState } from '@/features/search/search-centered-state'
import { SearchEmptyState } from '@/features/search/search-empty-state'

export function SearchPendingOrEmpty({
  className,
  status,
}: {
  className?: string
  status: SearchBufferStatus
}) {
  if (status === 'loading') {
    return (
      <SearchCenteredState className={className}>
        <CircleNotchIcon className='size-4 animate-spin' />
        Searching
      </SearchCenteredState>
    )
  }

  return (
    <SearchEmptyState
      className={className}
      description='Try a different query.'
      title='No matches'
    />
  )
}
