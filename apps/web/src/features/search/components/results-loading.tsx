import { LoadingState } from '@workspace/ui/components/loading-state'
import { cn } from '@workspace/ui/lib/utils'

export function SearchResultsLoading({ className }: { className?: string }) {
  return (
    <LoadingState className={cn('h-full min-h-0 overflow-hidden', className)} label='Searching'>
      <div aria-hidden='true' className='h-full overflow-hidden py-1'>
        <div className='flex h-7 items-center gap-1.5 px-2'>
          <div className='skeleton-sweep size-3 rounded-sm' />
          <div className='skeleton-sweep size-3.5 rounded-sm' />
          <div className='skeleton-sweep h-3 w-28' />
          <div className='skeleton-sweep ml-auto h-4 w-6 rounded-sm' />
        </div>
        <div className='space-y-0.5 pb-1'>
          <div className='grid h-6 grid-cols-[34px_minmax(0,1fr)] items-center gap-1.5 px-1.5'>
            <div className='skeleton-sweep ml-auto h-2.5 w-5' />
            <div className='skeleton-sweep h-2.5 w-3/4' />
          </div>
          <div className='grid h-6 grid-cols-[34px_minmax(0,1fr)] items-center gap-1.5 px-1.5'>
            <div className='skeleton-sweep ml-auto h-2.5 w-4' />
            <div className='skeleton-sweep h-2.5 w-4/5' />
          </div>
          <div className='grid h-6 grid-cols-[34px_minmax(0,1fr)] items-center gap-1.5 px-1.5'>
            <div className='skeleton-sweep ml-auto h-2.5 w-5' />
            <div className='skeleton-sweep h-2.5 w-2/3' />
          </div>
        </div>
        <div className='border-border/60 flex h-7 items-center gap-1.5 border-t px-2'>
          <div className='skeleton-sweep size-3 rounded-sm' />
          <div className='skeleton-sweep size-3.5 rounded-sm' />
          <div className='skeleton-sweep h-3 w-36' />
          <div className='skeleton-sweep ml-auto h-4 w-6 rounded-sm' />
        </div>
        <div className='grid h-6 grid-cols-[34px_minmax(0,1fr)] items-center gap-1.5 px-1.5'>
          <div className='skeleton-sweep ml-auto h-2.5 w-4' />
          <div className='skeleton-sweep h-2.5 w-3/5' />
        </div>
      </div>
    </LoadingState>
  )
}
