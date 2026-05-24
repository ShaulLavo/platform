import type { OrchestrationThreadActivity } from '@workspace/contracts'
import { cn } from '@workspace/ui/lib/utils'
import { DotOutlineIcon } from '@phosphor-icons/react'

import { activityToneClass, formatChatTimestamp } from '../lib/chat-formatters'

export function ActivityRow({ activity }: { activity: OrchestrationThreadActivity }) {
  return (
    <div className='flex justify-center'>
      <div
        className={cn(
          'flex max-w-[92%] items-center gap-1.5 rounded-md border px-2 py-1 text-[11px]',
          activityToneClass(activity.tone),
        )}
      >
        <DotOutlineIcon className='size-3.5 shrink-0' />
        <span className='truncate'>{activity.summary}</span>
        <span className='shrink-0 text-current/60 tabular-nums'>
          {formatChatTimestamp(activity.createdAt)}
        </span>
      </div>
    </div>
  )
}
