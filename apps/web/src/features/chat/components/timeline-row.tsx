import type { ChatTimelineItem } from '../lib/chat-timeline-items'
import { ActivityGroupRow } from './activity-group-row'
import { MessageBubble } from './message-bubble'
import { ProposedPlanCard } from './proposed-plan-card'
import { WorkingRow } from './working-row'

export function TimelineRow({ item }: { item: ChatTimelineItem }) {
  return (
    <div
      className='mx-auto w-full max-w-3xl min-w-0'
      data-timeline-row-id={item.id}
      data-timeline-row-type={item.type}
    >
      {timelineRowContent(item)}
    </div>
  )
}

function timelineRowContent(item: ChatTimelineItem) {
  if (item.type === 'message') return <MessageBubble message={item.message} />
  if (item.type === 'activity-group') return <ActivityGroupRow activities={item.activities} />
  if (item.type === 'proposed-plan') return <ProposedPlanCard plan={item.plan} />

  return <WorkingRow latestTurn={item.latestTurn} />
}
