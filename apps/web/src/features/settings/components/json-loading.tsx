import { LoadingState } from '@workspace/ui/components/loading-state'

export function JsonLoading() {
  return (
    <LoadingState
      className='h-full min-h-0 flex-1 overflow-hidden font-mono'
      label='Loading settings.json'
    >
      <div aria-hidden='true' className='h-full overflow-hidden py-3'>
        <div className='grid h-5 grid-cols-[44px_minmax(0,1fr)] items-center'>
          <div className='skeleton-sweep mr-3 ml-auto h-2 w-3' />
          <div className='skeleton-sweep h-2.5 w-1/4' />
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
          <div className='skeleton-sweep ml-4 h-2.5 w-3/5' />
        </div>
        <div className='grid h-5 grid-cols-[44px_minmax(0,1fr)] items-center'>
          <div className='skeleton-sweep mr-3 ml-auto h-2 w-3' />
          <div className='skeleton-sweep h-2.5 w-1/5' />
        </div>
      </div>
    </LoadingState>
  )
}
