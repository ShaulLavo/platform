import { useState } from 'react'

import { visibleActivityGroupRows } from '../lib/chat-activity-visibility'
import type { ChatWorkLogEntry } from '../lib/chat-work-log'
import { ActivityRow } from './activity-row'

const MAX_VISIBLE_ACTIVITY_ROWS = 6

export function ActivityGroupRow({ activities }: { activities: readonly ChatWorkLogEntry[] }) {
  const [expanded, setExpanded] = useState(false)
  const hasOverflow = activities.length > MAX_VISIBLE_ACTIVITY_ROWS
  const visibleActivities =
    hasOverflow && !expanded
      ? visibleActivityGroupRows(activities, MAX_VISIBLE_ACTIVITY_ROWS)
      : activities
  const hiddenCount = activities.length - visibleActivities.length
  const onlyToolActivities = activities.every((activity) => activity.tone === 'tool')
  const showHeader = hasOverflow || !onlyToolActivities
  const label = onlyToolActivities ? 'Tool calls' : 'Work log'

  return (
    <section className='border-border/45 bg-card/25 rounded-lg border px-2 py-1.5'>
      {showHeader ? (
        <div className='mb-1.5 flex items-center justify-between gap-2 px-0.5'>
          <p className='text-muted-foreground/55 text-[9px] tracking-[0.16em] uppercase'>
            {label} ({activities.length})
          </p>
          {hasOverflow ? (
            <button
              className='text-muted-foreground/55 hover:text-foreground/75 text-[9px] tracking-[0.12em] uppercase transition-colors'
              type='button'
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? 'Show less' : `Show ${hiddenCount} more`}
            </button>
          ) : null}
        </div>
      ) : null}
      <div className='space-y-0.5'>
        {visibleActivities.map((activity) => (
          <ActivityRow activity={activity} key={activity.id} />
        ))}
      </div>
    </section>
  )
}
