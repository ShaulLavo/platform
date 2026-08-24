import { LoadingState } from '@workspace/ui/components/loading-state'

export function TreeLoading() {
  return (
    <LoadingState className='h-full overflow-hidden' label='Loading folder'>
      <div aria-hidden='true' className='h-full overflow-hidden'>
        <div className='border-border flex h-7 items-center gap-1 border-b px-1.5'>
          <div className='skeleton-sweep h-3 w-16' />
          <div className='ml-auto flex gap-1.5'>
            <div className='skeleton-sweep size-3.5 rounded-sm' />
            <div className='skeleton-sweep size-3.5 rounded-sm' />
            <div className='skeleton-sweep size-3.5 rounded-sm' />
          </div>
        </div>
        <div className='compact:py-1 py-1.5'>
          <div className='compact:h-5 flex h-6 items-center gap-1.5 px-1.5'>
            <div className='skeleton-sweep size-3 rounded-sm' />
            <div className='skeleton-sweep size-3.5 rounded-sm' />
            <div className='skeleton-sweep h-3 w-24' />
          </div>
          <div className='compact:h-5 flex h-6 items-center gap-1.5 px-1.5 pl-5'>
            <div className='skeleton-sweep size-3 rounded-sm' />
            <div className='skeleton-sweep size-3.5 rounded-sm' />
            <div className='skeleton-sweep h-3 w-32' />
          </div>
          <div className='compact:h-5 flex h-6 items-center gap-1.5 px-1.5 pl-9'>
            <div className='skeleton-sweep size-3.5 rounded-sm' />
            <div className='skeleton-sweep h-3 w-28' />
          </div>
          <div className='compact:h-5 flex h-6 items-center gap-1.5 px-1.5 pl-9'>
            <div className='skeleton-sweep size-3.5 rounded-sm' />
            <div className='skeleton-sweep h-3 w-20' />
          </div>
          <div className='compact:h-5 flex h-6 items-center gap-1.5 px-1.5 pl-5'>
            <div className='skeleton-sweep size-3 rounded-sm' />
            <div className='skeleton-sweep size-3.5 rounded-sm' />
            <div className='skeleton-sweep h-3 w-24' />
          </div>
          <div className='compact:h-5 flex h-6 items-center gap-1.5 px-1.5'>
            <div className='skeleton-sweep size-3 rounded-sm' />
            <div className='skeleton-sweep size-3.5 rounded-sm' />
            <div className='skeleton-sweep h-3 w-28' />
          </div>
        </div>
      </div>
    </LoadingState>
  )
}
