import { LoadingState } from '@workspace/ui/components/loading-state'

export function CompareSavedLoading() {
  return (
    <LoadingState className='h-full min-h-0 flex-1 overflow-hidden' label='Loading saved contents'>
      <div aria-hidden='true' className='grid h-full min-h-0 grid-cols-2 overflow-hidden font-mono'>
        <div className='border-border min-w-0 border-r py-2'>
          <div className='text-muted-foreground/30 mb-2 flex h-5 items-center gap-2 px-3'>
            <div className='skeleton-sweep h-2.5 w-20' />
          </div>
          <div className='grid h-5 grid-cols-[40px_minmax(0,1fr)] items-center'>
            <div className='skeleton-sweep mr-2 ml-auto h-2 w-3' />
            <div className='skeleton-sweep h-2.5 w-2/3' />
          </div>
          <div className='bg-diff-removed/10 grid h-5 grid-cols-[40px_minmax(0,1fr)] items-center'>
            <div className='bg-diff-removed/25 mr-2 ml-auto h-2 w-3' />
            <div className='skeleton-sweep h-2.5 w-4/5' />
          </div>
          <div className='bg-diff-removed/10 grid h-5 grid-cols-[40px_minmax(0,1fr)] items-center'>
            <div className='bg-diff-removed/25 mr-2 ml-auto h-2 w-3' />
            <div className='skeleton-sweep ml-4 h-2.5 w-1/2' />
          </div>
          <div className='grid h-5 grid-cols-[40px_minmax(0,1fr)] items-center'>
            <div className='skeleton-sweep mr-2 ml-auto h-2 w-3' />
            <div className='skeleton-sweep h-2.5 w-3/5' />
          </div>
        </div>
        <div className='min-w-0 py-2'>
          <div className='text-muted-foreground/30 mb-2 flex h-5 items-center gap-2 px-3'>
            <div className='skeleton-sweep h-2.5 w-24' />
          </div>
          <div className='grid h-5 grid-cols-[40px_minmax(0,1fr)] items-center'>
            <div className='skeleton-sweep mr-2 ml-auto h-2 w-3' />
            <div className='skeleton-sweep h-2.5 w-2/3' />
          </div>
          <div className='bg-diff-added/10 grid h-5 grid-cols-[40px_minmax(0,1fr)] items-center'>
            <div className='bg-diff-added/25 mr-2 ml-auto h-2 w-3' />
            <div className='skeleton-sweep h-2.5 w-3/4' />
          </div>
          <div className='bg-diff-added/10 grid h-5 grid-cols-[40px_minmax(0,1fr)] items-center'>
            <div className='bg-diff-added/25 mr-2 ml-auto h-2 w-3' />
            <div className='skeleton-sweep ml-4 h-2.5 w-3/5' />
          </div>
          <div className='grid h-5 grid-cols-[40px_minmax(0,1fr)] items-center'>
            <div className='skeleton-sweep mr-2 ml-auto h-2 w-3' />
            <div className='skeleton-sweep h-2.5 w-3/5' />
          </div>
        </div>
      </div>
    </LoadingState>
  )
}
