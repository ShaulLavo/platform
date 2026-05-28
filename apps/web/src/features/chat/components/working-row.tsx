import type { OrchestrationLatestTurn } from '@workspace/contracts'

import { WorkingTimer } from './working-timer'

export function WorkingRow({ latestTurn }: { latestTurn: OrchestrationLatestTurn }) {
  const startedAt = latestTurn.startedAt ?? latestTurn.requestedAt

  return (
    <div className='py-0.5 pl-1.5'>
      <div className='text-muted-foreground/70 flex items-center gap-2 pt-1 text-[11px]'>
        <span className='inline-flex items-center gap-[3px]'>
          <span className='bg-muted-foreground/30 h-1 w-1 animate-pulse rounded-full' />
          <span className='bg-muted-foreground/30 h-1 w-1 animate-pulse rounded-full [animation-delay:200ms]' />
          <span className='bg-muted-foreground/30 h-1 w-1 animate-pulse rounded-full [animation-delay:400ms]' />
        </span>
        <span>
          {latestTurn.sourceProposedPlan ? 'Working from plan for ' : 'Working for '}
          <WorkingTimer startedAt={startedAt} />
        </span>
      </div>
    </div>
  )
}
