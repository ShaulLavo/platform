import { LoadingState } from '@workspace/ui/components/loading-state'

export function CommandMenuLoading({ label }: { label: string }) {
  return (
    <LoadingState label={label}>
      <div aria-hidden='true' className='space-y-0.5'>
        {[0, 1, 2].map((row) => (
          <div className='compact:py-1.5 flex items-center gap-2 py-2' key={row}>
            <div className='skeleton-sweep size-4 shrink-0 rounded-sm' />
            <div className='skeleton-sweep h-3 w-20 shrink-0' />
            <div className='skeleton-sweep h-2.5 min-w-0 flex-1' />
          </div>
        ))}
      </div>
    </LoadingState>
  )
}
