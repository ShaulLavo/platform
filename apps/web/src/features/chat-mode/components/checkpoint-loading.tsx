import { LoadingState } from '@workspace/ui/components/loading-state'

export function CheckpointLoading() {
  return (
    <LoadingState
      className='compact:px-2 compact:py-1.5 h-full min-h-0 px-3 py-2'
      label='Loading checkpoint'
    >
      <div aria-hidden='true' className='space-y-1'>
        <div className='mb-1.5 flex items-center gap-2'>
          <div className='skeleton-sweep h-2.5 w-20' />
          <div className='skeleton-sweep h-2.5 w-10' />
        </div>
        <div className='flex h-7 items-center gap-2'>
          <div className='skeleton-sweep h-3 min-w-0 flex-1' />
          <div className='bg-diff-added/20 h-2.5 w-6 rounded-sm' />
          <div className='bg-diff-removed/20 h-2.5 w-5 rounded-sm' />
        </div>
        <div className='flex h-7 items-center gap-2'>
          <div className='skeleton-sweep h-3 w-3/4' />
          <div className='bg-diff-added/20 ml-auto h-2.5 w-5 rounded-sm' />
          <div className='bg-diff-removed/20 h-2.5 w-4 rounded-sm' />
        </div>
        <div className='flex h-7 items-center gap-2'>
          <div className='skeleton-sweep h-3 w-1/2' />
          <div className='bg-diff-added/20 ml-auto h-2.5 w-6 rounded-sm' />
          <div className='bg-diff-removed/20 h-2.5 w-5 rounded-sm' />
        </div>
      </div>
    </LoadingState>
  )
}
