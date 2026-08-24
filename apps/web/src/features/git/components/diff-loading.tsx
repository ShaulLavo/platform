import { LoadingState } from '@workspace/ui/components/loading-state'

export function DiffLoading() {
  return (
    <LoadingState className='h-full min-h-0 flex-1 overflow-hidden' label='Loading diff'>
      <div aria-hidden='true' className='flex h-full min-h-0 flex-col overflow-hidden font-mono'>
        <div className='border-border flex h-7 shrink-0 items-center gap-2 border-b px-3'>
          <div className='skeleton-sweep h-2.5 w-32' />
          <div className='skeleton-sweep h-2.5 w-16' />
          <div className='skeleton-sweep ml-auto size-3 rounded-sm' />
        </div>
        <div className='min-h-0 flex-1 overflow-hidden py-2 text-[11px]'>
          <div className='grid h-5 grid-cols-[48px_minmax(0,1fr)] items-center'>
            <div className='skeleton-sweep mr-3 ml-auto h-2 w-3' />
            <div className='skeleton-sweep h-2.5 w-2/5' />
          </div>
          <div className='bg-diff-removed/10 grid h-5 grid-cols-[48px_minmax(0,1fr)] items-center'>
            <div className='bg-diff-removed/25 mr-3 ml-auto h-2 w-4' />
            <div className='skeleton-sweep h-2.5 w-3/5' />
          </div>
          <div className='bg-diff-added/10 grid h-5 grid-cols-[48px_minmax(0,1fr)] items-center'>
            <div className='bg-diff-added/25 mr-3 ml-auto h-2 w-4' />
            <div className='skeleton-sweep h-2.5 w-2/3' />
          </div>
          <div className='grid h-5 grid-cols-[48px_minmax(0,1fr)] items-center'>
            <div className='skeleton-sweep mr-3 ml-auto h-2 w-4' />
            <div className='skeleton-sweep h-2.5 w-1/2' />
          </div>
          <div className='grid h-5 grid-cols-[48px_minmax(0,1fr)] items-center'>
            <div className='skeleton-sweep mr-3 ml-auto h-2 w-4' />
            <div className='skeleton-sweep ml-5 h-2.5 w-5/12' />
          </div>
          <div className='grid h-5 grid-cols-[48px_minmax(0,1fr)] items-center'>
            <div className='skeleton-sweep mr-3 ml-auto h-2 w-4' />
            <div className='skeleton-sweep ml-5 h-2.5 w-7/12' />
          </div>
          <div className='bg-diff-removed/10 grid h-5 grid-cols-[48px_minmax(0,1fr)] items-center'>
            <div className='bg-diff-removed/25 mr-3 ml-auto h-2 w-4' />
            <div className='skeleton-sweep h-2.5 w-1/3' />
          </div>
          <div className='bg-diff-added/10 grid h-5 grid-cols-[48px_minmax(0,1fr)] items-center'>
            <div className='bg-diff-added/25 mr-3 ml-auto h-2 w-4' />
            <div className='skeleton-sweep h-2.5 w-1/2' />
          </div>
        </div>
      </div>
    </LoadingState>
  )
}
