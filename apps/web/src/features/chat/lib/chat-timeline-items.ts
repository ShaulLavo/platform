import type {
  OrchestrationLatestTurn,
  OrchestrationMessage,
  OrchestrationThreadActivity,
} from '@workspace/contracts'

import type { OptimisticChatMessage } from '../state/chat-optimistic-store'

export type ChatTimelineItem =
  | {
      activity: OrchestrationThreadActivity
      id: string
      timestamp: string
      type: 'activity'
    }
  | {
      id: string
      message: OrchestrationMessage | OptimisticChatMessage
      timestamp: string
      type: 'message'
    }
  | {
      id: string
      latestTurn: OrchestrationLatestTurn
      timestamp: string
      type: 'working'
    }

export function chatTimelineItems({
  activities,
  latestTurn,
  messages,
  optimisticMessages,
}: {
  activities: readonly OrchestrationThreadActivity[]
  latestTurn: OrchestrationLatestTurn | null
  messages: readonly OrchestrationMessage[]
  optimisticMessages: readonly OptimisticChatMessage[]
}) {
  const resolvedMessageIds = new Set(messages.map((message) => message.id))
  const items: ChatTimelineItem[] = []

  for (const message of messages) {
    items.push(messageTimelineItem(message))
  }
  for (const message of optimisticMessages) {
    if (resolvedMessageIds.has(message.id)) continue

    items.push(messageTimelineItem(message))
  }
  for (const activity of activities) {
    items.push(activityTimelineItem(activity))
  }
  if (latestTurn?.state === 'running') {
    items.push(workingTimelineItem(latestTurn))
  }

  return items.toSorted(compareTimelineItems)
}

export function chatTimelineItemEstimate(item: ChatTimelineItem | undefined) {
  if (!item) return 64
  if (item.type === 'activity') return 44
  if (item.type === 'working') return 52

  return Math.min(220, Math.max(56, 42 + Math.ceil(item.message.text.length / 48) * 18))
}

function messageTimelineItem(
  message: OrchestrationMessage | OptimisticChatMessage,
): ChatTimelineItem {
  return {
    id: `message:${message.id}`,
    message,
    timestamp: message.createdAt,
    type: 'message',
  }
}

function activityTimelineItem(activity: OrchestrationThreadActivity): ChatTimelineItem {
  return {
    activity,
    id: `activity:${activity.id}`,
    timestamp: activity.createdAt,
    type: 'activity',
  }
}

function workingTimelineItem(latestTurn: OrchestrationLatestTurn): ChatTimelineItem {
  return {
    id: `working:${latestTurn.turnId}`,
    latestTurn,
    timestamp: latestTurn.startedAt ?? latestTurn.requestedAt,
    type: 'working',
  }
}

function compareTimelineItems(left: ChatTimelineItem, right: ChatTimelineItem) {
  return (
    left.timestamp.localeCompare(right.timestamp) ||
    timelineItemOrder(left) - timelineItemOrder(right) ||
    left.id.localeCompare(right.id)
  )
}

function timelineItemOrder(item: ChatTimelineItem) {
  if (item.type === 'message') return item.message.role === 'user' ? 1 : 2
  if (item.type === 'activity') return 3

  return 4
}
