import { LoadingState } from '@workspace/ui/components/loading-state'

export function ModelsLoading() {
  return (
    <LoadingState className='compact:px-1 compact:py-1.5 px-1 py-2' label='Loading providers'>
      <div aria-hidden='true' className='space-y-1'>
        <div className='compact:px-1.5 compact:py-1.5 flex items-center gap-2 rounded-md px-2 py-2'>
          <div className='min-w-0 flex-1 space-y-1.5'>
            <div className='skeleton-sweep h-3 w-2/5' />
            <div className='flex items-center gap-1.5'>
              <div className='skeleton-sweep size-3 rounded-sm' />
              <div className='skeleton-sweep h-2.5 w-1/3' />
            </div>
          </div>
          <div className='skeleton-sweep h-4 w-12 rounded-sm' />
        </div>
        <div className='compact:px-1.5 compact:py-1.5 flex items-center gap-2 rounded-md px-2 py-2'>
          <div className='min-w-0 flex-1 space-y-1.5'>
            <div className='skeleton-sweep h-3 w-1/2' />
            <div className='flex items-center gap-1.5'>
              <div className='skeleton-sweep size-3 rounded-sm' />
              <div className='skeleton-sweep h-2.5 w-2/5' />
            </div>
          </div>
          <div className='flex gap-1'>
            <div className='skeleton-sweep h-4 w-9 rounded-sm' />
            <div className='skeleton-sweep h-4 w-11 rounded-sm' />
          </div>
        </div>
        <div className='compact:px-1.5 compact:py-1.5 flex items-center gap-2 rounded-md px-2 py-2'>
          <div className='min-w-0 flex-1 space-y-1.5'>
            <div className='skeleton-sweep h-3 w-1/3' />
            <div className='flex items-center gap-1.5'>
              <div className='skeleton-sweep size-3 rounded-sm' />
              <div className='skeleton-sweep h-2.5 w-1/4' />
            </div>
          </div>
          <div className='skeleton-sweep h-4 w-14 rounded-sm' />
        </div>
      </div>
    </LoadingState>
  )
}
