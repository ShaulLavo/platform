import { MagnifyingGlassIcon, WarningCircleIcon } from '@phosphor-icons/react'
import type { WorkspaceSearchWarningEvent } from '@workspace/contracts'
import { EmptyState } from '@workspace/ui/components/empty-state'
import { LoadingState } from '@workspace/ui/components/loading-state'

import type { SearchBufferStatus } from '@/features/search/state/buffer-state'

export function SearchPendingOrEmpty({
  className,
  status,
  warnings = [],
}: {
  className?: string
  status: SearchBufferStatus
  warnings?: readonly WorkspaceSearchWarningEvent[]
}) {
  if (status === 'loading') {
    return <LoadingState className={className} label='Searching' rows={5} />
  }

  const warning = warnings[0]
  if (warning) {
    return (
      <EmptyState
        className={className}
        description={warning.message}
        icon={<WarningCircleIcon className='size-5' weight='duotone' />}
        title='No matches'
        tone='warning'
      />
    )
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
