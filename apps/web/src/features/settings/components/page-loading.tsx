import { LoadingState } from '@workspace/ui/components/loading-state'

export function PageLoading({ showJson }: { showJson: boolean }) {
  return (
    <LoadingState className='flex h-full min-h-0 flex-col' label='Loading settings'>
      <div aria-hidden='true' className='flex h-full min-h-0 flex-col overflow-hidden'>
        <header className='border-border compact:gap-1.5 compact:px-3 compact:pb-3 flex shrink-0 flex-col gap-2 border-b px-4 pt-2 pb-4'>
          <div className='flex h-6 items-center justify-end gap-1'>
            <div className='skeleton-sweep h-5 w-14 rounded-sm' />
            <div className='skeleton-sweep h-5 w-16 rounded-sm' />
          </div>
          <div className='flex gap-1'>
            <div className='skeleton-sweep h-7 w-20 rounded-sm' />
            <div className='skeleton-sweep h-7 w-24 rounded-sm' />
            <div className='skeleton-sweep h-7 w-20 rounded-sm' />
          </div>
          {showJson ? null : <div className='skeleton-sweep h-8 w-full rounded-sm' />}
          {showJson ? null : <div className='skeleton-sweep h-3 w-24' />}
        </header>
        {showJson ? (
          <div className='min-h-0 flex-1 overflow-hidden py-3 font-mono'>
            <div className='grid h-5 grid-cols-[44px_minmax(0,1fr)] items-center'>
              <div className='skeleton-sweep mr-3 ml-auto h-2 w-3' />
              <div className='skeleton-sweep h-2.5 w-2/5' />
            </div>
            <div className='grid h-5 grid-cols-[44px_minmax(0,1fr)] items-center'>
              <div className='skeleton-sweep mr-3 ml-auto h-2 w-3' />
              <div className='skeleton-sweep ml-4 h-2.5 w-1/2' />
            </div>
            <div className='grid h-5 grid-cols-[44px_minmax(0,1fr)] items-center'>
              <div className='skeleton-sweep mr-3 ml-auto h-2 w-3' />
              <div className='skeleton-sweep ml-4 h-2.5 w-2/3' />
            </div>
            <div className='grid h-5 grid-cols-[44px_minmax(0,1fr)] items-center'>
              <div className='skeleton-sweep mr-3 ml-auto h-2 w-3' />
              <div className='skeleton-sweep ml-4 h-2.5 w-5/12' />
            </div>
            <div className='grid h-5 grid-cols-[44px_minmax(0,1fr)] items-center'>
              <div className='skeleton-sweep mr-3 ml-auto h-2 w-3' />
              <div className='skeleton-sweep h-2.5 w-1/3' />
            </div>
          </div>
        ) : (
          <div className='compact:p-3 min-h-0 flex-1 overflow-hidden p-4'>
            <div className='skeleton-sweep mb-2 h-3.5 w-28' />
            <div className='border-border flex items-center gap-6 border-b py-3'>
              <div className='min-w-0 flex-1 space-y-1.5'>
                <div className='skeleton-sweep h-3 w-2/5' />
                <div className='skeleton-sweep h-2.5 w-4/5' />
              </div>
              <div className='skeleton-sweep h-6 w-20 rounded-sm' />
            </div>
            <div className='border-border flex items-center gap-6 border-b py-3'>
              <div className='min-w-0 flex-1 space-y-1.5'>
                <div className='skeleton-sweep h-3 w-1/3' />
                <div className='skeleton-sweep h-2.5 w-2/3' />
              </div>
              <div className='skeleton-sweep h-6 w-28 rounded-sm' />
            </div>
            <div className='border-border flex items-center gap-6 border-b py-3'>
              <div className='min-w-0 flex-1 space-y-1.5'>
                <div className='skeleton-sweep h-3 w-1/2' />
                <div className='skeleton-sweep h-2.5 w-3/4' />
              </div>
              <div className='skeleton-sweep h-6 w-16 rounded-full' />
            </div>
            <div className='skeleton-sweep mt-6 mb-2 h-3.5 w-24' />
            <div className='border-border flex items-center gap-6 border-b py-3'>
              <div className='min-w-0 flex-1 space-y-1.5'>
                <div className='skeleton-sweep h-3 w-2/5' />
                <div className='skeleton-sweep h-2.5 w-3/5' />
              </div>
              <div className='skeleton-sweep h-6 w-24 rounded-sm' />
            </div>
          </div>
        )}
      </div>
    </LoadingState>
  )
}
