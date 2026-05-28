import type {
  OrchestrationLatestTurn,
  OrchestrationMessage,
  OrchestrationProposedPlan,
  OrchestrationThreadActivity,
} from '@workspace/contracts'

import type { OptimisticChatMessage } from '../state/chat-optimistic-store'

export type ChatTimelineItem =
  | {
      activities: OrchestrationThreadActivity[]
      id: string
      timestamp: string
      type: 'activity-group'
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
  | {
      id: string
      plan: OrchestrationProposedPlan
      timestamp: string
      type: 'proposed-plan'
    }

type ChronologicalTimelineItem =
  | {
      activity: OrchestrationThreadActivity
      id: string
      sourceOrder: number
      timestamp: string
      type: 'activity'
    }
  | {
      id: string
      message: OrchestrationMessage | OptimisticChatMessage
      sourceOrder: number
      timestamp: string
      type: 'message'
    }
  | {
      id: string
      plan: OrchestrationProposedPlan
      sourceOrder: number
      timestamp: string
      type: 'proposed-plan'
    }

export function chatTimelineItems({
  activities,
  latestTurn,
  messages,
  optimisticMessages,
  proposedPlans,
}: {
  activities: readonly OrchestrationThreadActivity[]
  latestTurn: OrchestrationLatestTurn | null
  messages: readonly OrchestrationMessage[]
  optimisticMessages: readonly OptimisticChatMessage[]
  proposedPlans: readonly OrchestrationProposedPlan[]
}) {
  const resolvedMessageIds = new Set(messages.map((message) => message.id))
  const items: ChronologicalTimelineItem[] = []
  let sourceOrder = 0

  for (const message of messages) {
    items.push(messageTimelineItem(message, sourceOrder))
    sourceOrder += 1
  }
  for (const message of optimisticMessages) {
    if (resolvedMessageIds.has(message.id)) continue

    items.push(messageTimelineItem(message, sourceOrder))
    sourceOrder += 1
  }
  for (const plan of proposedPlans) {
    items.push(proposedPlanTimelineItem(plan, sourceOrder))
    sourceOrder += 1
  }
  for (const activity of activities) {
    items.push(activityTimelineItem(activity, sourceOrder))
    sourceOrder += 1
  }

  const timelineItems = groupActivityTimelineItems(items.toSorted(compareTimelineEntries))
  if (latestTurn?.state === 'running') {
    timelineItems.push(workingTimelineItem(latestTurn))
  }

  return timelineItems
}

export function chatTimelineItemEstimate(item: ChatTimelineItem | undefined) {
  if (!item) return 64
  if (item.type === 'activity-group') return Math.min(220, 36 + item.activities.length * 28)
  if (item.type === 'proposed-plan') return 160
  if (item.type === 'working') return 52

  return Math.min(220, Math.max(56, 42 + Math.ceil(item.message.text.length / 48) * 18))
}

function messageTimelineItem(
  message: OrchestrationMessage | OptimisticChatMessage,
  sourceOrder: number,
): ChronologicalTimelineItem {
  return {
    id: `message:${message.id}`,
    message,
    sourceOrder,
    timestamp: message.createdAt,
    type: 'message',
  }
}

function activityTimelineItem(
  activity: OrchestrationThreadActivity,
  sourceOrder: number,
): ChronologicalTimelineItem {
  return {
    activity,
    id: `activity:${activity.id}`,
    sourceOrder,
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

function proposedPlanTimelineItem(
  plan: OrchestrationProposedPlan,
  sourceOrder: number,
): ChronologicalTimelineItem {
  return {
    id: `proposed-plan:${plan.id}`,
    plan,
    sourceOrder,
    timestamp: plan.createdAt,
    type: 'proposed-plan',
  }
}

function compareTimelineEntries(left: ChronologicalTimelineItem, right: ChronologicalTimelineItem) {
  return left.timestamp.localeCompare(right.timestamp) || left.sourceOrder - right.sourceOrder
}

function groupActivityTimelineItems(items: readonly ChronologicalTimelineItem[]) {
  const groupedItems: ChatTimelineItem[] = []
  let pendingActivities: OrchestrationThreadActivity[] = []

  for (const item of items) {
    if (item.type === 'activity') {
      pendingActivities.push(item.activity)
      continue
    }

    appendActivityGroup(groupedItems, pendingActivities)
    pendingActivities = []
    groupedItems.push(timelineItemFromEntry(item))
  }

  appendActivityGroup(groupedItems, pendingActivities)

  return groupedItems
}

function timelineItemFromEntry(item: Exclude<ChronologicalTimelineItem, { type: 'activity' }>) {
  if (item.type === 'message') {
    return {
      id: item.id,
      message: item.message,
      timestamp: item.timestamp,
      type: item.type,
    }
  }

  return {
    id: item.id,
    plan: item.plan,
    timestamp: item.timestamp,
    type: item.type,
  }
}

function appendActivityGroup(
  items: ChatTimelineItem[],
  activities: readonly OrchestrationThreadActivity[],
) {
  const firstActivity = activities[0]
  if (!firstActivity) return

  items.push({
    activities: [...activities],
    id: `activity-group:${firstActivity.id}`,
    timestamp: firstActivity.createdAt,
    type: 'activity-group',
  })
}
