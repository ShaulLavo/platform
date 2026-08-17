import { MagnifyingGlassIcon } from '@phosphor-icons/react'
import { EmptyState } from '@workspace/ui/components/empty-state'
import { LoadingState } from '@workspace/ui/components/loading-state'

import type { SearchBufferStatus } from '@/features/search/state/buffer-state'

export function SearchPendingOrEmpty({
  className,
  status,
}: {
  className?: string
  status: SearchBufferStatus
}) {
  if (status === 'loading') {
    return <LoadingState className={className} label='Searching' rows={5} />
  }

  return (
    <EmptyState
      className={className}
      description='Try a different query.'
      icon={<MagnifyingGlassIcon className='size-5' />}
      title='No matches'
    />
  )
}
