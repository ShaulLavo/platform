import { LoadingState } from '@workspace/ui/components/loading-state'

export function RecentsLoading() {
  return (
    <LoadingState className='compact:px-1.5 compact:py-1 px-2 py-1.5' label='Loading recents'>
      <div aria-hidden='true' className='space-y-0.5'>
        <div className='compact:h-6 flex h-7 items-center gap-2 px-2'>
          <div className='skeleton-sweep size-4 rounded-sm' />
          <div className='skeleton-sweep h-3 w-2/3' />
        </div>
        <div className='compact:h-6 flex h-7 items-center gap-2 px-2'>
          <div className='skeleton-sweep size-4 rounded-sm' />
          <div className='skeleton-sweep h-3 w-1/2' />
        </div>
      </div>
    </LoadingState>
  )
}
