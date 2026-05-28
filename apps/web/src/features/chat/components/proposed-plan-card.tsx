import type { OrchestrationProposedPlan } from '@workspace/contracts'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { cn } from '@workspace/ui/lib/utils'
import { CaretDownIcon, CaretUpIcon } from '@phosphor-icons/react'
import { useState } from 'react'

import { formatChatTimestamp } from '../lib/chat-formatters'
import {
  canCollapseProposedPlan,
  collapsedProposedPlanMarkdown,
  proposedPlanTitle,
  stripDisplayedPlanMarkdown,
} from '../lib/chat-proposed-plan'
import { AssistantMarkdown } from './assistant-markdown'

export function ProposedPlanCard({ plan }: { plan: OrchestrationProposedPlan }) {
  const [expanded, setExpanded] = useState(false)
  const canCollapse = canCollapseProposedPlan(plan.planMarkdown)
  const markdown =
    canCollapse && !expanded
      ? collapsedProposedPlanMarkdown(plan.planMarkdown)
      : stripDisplayedPlanMarkdown(plan.planMarkdown)
  const title = proposedPlanTitle(plan.planMarkdown)
  const ExpandIcon = expanded ? CaretUpIcon : CaretDownIcon

  return (
    <article className='border-border/80 bg-card/70 rounded-lg border p-4 text-sm sm:p-5'>
      <div className='flex min-w-0 flex-wrap items-center justify-between gap-3'>
        <div className='flex min-w-0 items-center gap-2'>
          <Badge variant='secondary'>Plan</Badge>
          <p className='text-foreground truncate text-sm font-medium'>{title}</p>
        </div>
        <span className='text-muted-foreground/50 shrink-0 text-[10px] tabular-nums'>
          {formatChatTimestamp(plan.updatedAt)}
        </span>
      </div>
      <div className='mt-4'>
        <div
          className={cn('relative', canCollapse && !expanded && 'max-h-[26rem] overflow-hidden')}
        >
          <AssistantMarkdown className='text-xs leading-5' text={markdown} />
          {canCollapse && !expanded ? (
            <div className='from-card/95 via-card/80 pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-linear-to-t to-transparent' />
          ) : null}
        </div>
        {canCollapse ? (
          <div className='mt-4 flex justify-center'>
            <Button
              className='rounded-md'
              size='sm'
              type='button'
              variant='outline'
              onClick={() => setExpanded((value) => !value)}
            >
              <ExpandIcon className='size-3.5' />
              {expanded ? 'Collapse plan' : 'Expand plan'}
            </Button>
          </div>
        ) : null}
      </div>
    </article>
  )
}
