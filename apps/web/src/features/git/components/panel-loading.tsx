import { LoadingState } from '@workspace/ui/components/loading-state'
import { cn } from '@workspace/ui/lib/utils'

export function PanelLoading({ className }: { className?: string }) {
  return (
    <LoadingState className={cn('flex h-full min-h-0 flex-col', className)} label='Loading Git'>
      <div aria-hidden='true' className='flex min-h-0 flex-1 flex-col'>
        <div className='border-border flex h-8 shrink-0 items-center gap-2 border-b px-2'>
          <div className='skeleton-sweep h-3.5 w-28' />
          <div className='ml-auto flex gap-1.5'>
            <div className='skeleton-sweep size-4 rounded-sm' />
            <div className='skeleton-sweep size-4 rounded-sm' />
          </div>
        </div>
        <div className='border-border space-y-2 border-b p-2'>
          <div className='skeleton-sweep h-12 w-full rounded-sm' />
          <div className='flex gap-2'>
            <div className='skeleton-sweep h-6 flex-1 rounded-sm' />
            <div className='skeleton-sweep h-6 w-16 rounded-sm' />
          </div>
        </div>
        <div className='min-h-0 flex-1 overflow-hidden pt-2'>
          <div className='flex h-7 items-center gap-2 px-2'>
            <div className='skeleton-sweep size-3 rounded-sm' />
            <div className='skeleton-sweep h-3 w-24' />
            <div className='skeleton-sweep ml-auto size-5 rounded-full' />
          </div>
          <div className='border-border ml-5 space-y-0.5 border-l py-0.5'>
            <div className='flex h-6 items-center gap-2 px-2'>
              <div className='skeleton-sweep size-4 rounded-sm' />
              <div className='skeleton-sweep h-3 w-28' />
              <div className='skeleton-sweep ml-auto h-3 w-4' />
            </div>
            <div className='flex h-6 items-center gap-2 px-2'>
              <div className='skeleton-sweep size-4 rounded-sm' />
              <div className='skeleton-sweep h-3 w-36' />
              <div className='skeleton-sweep ml-auto h-3 w-4' />
            </div>
            <div className='flex h-6 items-center gap-2 px-2'>
              <div className='skeleton-sweep size-4 rounded-sm' />
              <div className='skeleton-sweep h-3 w-24' />
              <div className='skeleton-sweep ml-auto h-3 w-4' />
            </div>
          </div>
        </div>
      </div>
    </LoadingState>
  )
}
