import type { OrchestrationLatestTurn } from '@workspace/contracts'
import { OrbitLoader } from '@workspace/ui/components/orbit-loader'

import type { ChatWorkLogPlan } from '@/features/chat/utils/work-log'
import { WorkingTimer } from './working-timer'

export function WorkingRow({
  latestTurn,
  plan = null,
}: {
  latestTurn: OrchestrationLatestTurn
  plan?: ChatWorkLogPlan | null
}) {
  const startedAt = latestTurn.startedAt ?? latestTurn.requestedAt

  return (
    <div className='py-0.5 pl-1.5'>
      <div className='text-muted-foreground/70 flex items-center gap-2 pt-1 text-[11px]'>
        <OrbitLoader className='size-3.5 shrink-0' label='Working' />
        <span>
          {latestTurn.sourceProposedPlan ? 'Working from plan for ' : 'Working for '}
          <WorkingTimer startedAt={startedAt} />
        </span>
      </div>
      {plan?.currentStep ? (
        <p className='text-muted-foreground/60 mt-0.5 flex min-w-0 items-center gap-1.5 pl-[26px] text-[11px]'>
          <span className='shrink-0 tabular-nums'>
            {plan.completedCount}/{plan.steps.length}
          </span>
          <span className='truncate'>{plan.currentStep}</span>
        </p>
      ) : null}
    </div>
  )
}
