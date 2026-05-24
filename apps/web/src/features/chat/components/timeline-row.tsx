import type { ChatTimelineItem } from '../lib/chat-timeline-items'
import { ActivityRow } from './activity-row'
import { MessageBubble } from './message-bubble'
import { WorkingRow } from './working-row'

export function TimelineRow({ item }: { item: ChatTimelineItem }) {
  if (item.type === 'message') return <MessageBubble message={item.message} />
  if (item.type === 'activity') return <ActivityRow activity={item.activity} />

  return <WorkingRow />
}
