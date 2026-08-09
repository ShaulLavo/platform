import type {
  OrchestrationLatestTurn,
  OrchestrationMessage,
  OrchestrationProposedPlan,
  OrchestrationThreadActivity,
} from '@workspace/contracts'

import type { OptimisticChatMessage } from '../state/chat-optimistic-store'
import type { ChatTurnDiffSummary } from '../state/chat-projection-store'
import {
  chatMessageTimelineMetadata,
  type ChatTimelineMessage,
  fallbackChatMessageTimelineMetadata,
} from './chat-message-metadata'
import {
  chatActiveWorkLogPlan,
  chatWorkLogEntries,
  type ChatWorkLogEntry,
  type ChatWorkLogPlan,
} from './chat-work-log'

export type ChatTimelineItem =
  | {
      activities: ChatWorkLogEntry[]
      id: string
      timestamp: string
      type: 'activity-group'
    }
  | {
      assistantStreaming: boolean
      assistantTurnInProgress: boolean
      completionSummary: string | null
      durationEnd: string
      durationStart: string
      id: string
      message: OrchestrationMessage | OptimisticChatMessage
      revertTurnCount: number | null
      showAssistantCopyButton: boolean
      showCompletionDivider: boolean
      timestamp: string
      turnDiffSummary: ChatTurnDiffSummary | null
      type: 'message'
    }
  | {
      id: string
      latestTurn: OrchestrationLatestTurn
      plan: ChatWorkLogPlan | null
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
      activity: ChatWorkLogEntry
      id: string
      sourceOrder: number
      timestamp: string
      type: 'activity'
    }
  | {
      assistantStreaming: boolean
      assistantTurnInProgress: boolean
      completionSummary: string | null
      durationEnd: string
      durationStart: string
      id: string
      message: OrchestrationMessage | OptimisticChatMessage
      revertTurnCount: number | null
      showAssistantCopyButton: boolean
      showCompletionDivider: boolean
      sourceOrder: number
      timestamp: string
      turnDiffSummary: ChatTurnDiffSummary | null
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
  turnDiffSummaries = [],
}: {
  activities: readonly OrchestrationThreadActivity[]
  latestTurn: OrchestrationLatestTurn | null
  messages: readonly OrchestrationMessage[]
  optimisticMessages: readonly OptimisticChatMessage[]
  proposedPlans: readonly OrchestrationProposedPlan[]
  turnDiffSummaries?: readonly ChatTurnDiffSummary[]
}) {
  const resolvedMessageIds = new Set(messages.map((message) => message.id))
  const visibleOptimisticMessages = optimisticMessages.filter(
    (message) => !resolvedMessageIds.has(message.id),
  )
  const timelineMessages = [...messages, ...visibleOptimisticMessages]
  const workLogEntries = chatWorkLogEntries({ activities })
  const messageMetadata = chatMessageTimelineMetadata({
    latestTurn,
    messages: timelineMessages,
    // The completion divider reports the latest turn's duration, so only that turn's
    // work decides whether there was anything to report.
    showCompletionSummary: latestTurnWorkLogEntryCount(workLogEntries, latestTurn) > 0,
  })
  const turnDiffSummaryByAssistantMessageId = deriveTurnDiffSummaryByAssistantMessageId(
    turnDiffSummaries,
    timelineMessages,
  )
  const revertTurnCountByUserMessageId = deriveRevertTurnCountByUserMessageId(
    timelineMessages,
    turnDiffSummaryByAssistantMessageId,
  )
  const items: ChronologicalTimelineItem[] = []
  let sourceOrder = 0

  for (const message of messages) {
    items.push(
      messageTimelineItem(
        message,
        sourceOrder,
        messageMetadata.get(message.id),
        turnDiffSummaryByAssistantMessageId.get(message.id) ?? null,
        revertTurnCountByUserMessageId.get(message.id) ?? null,
      ),
    )
    sourceOrder += 1
  }
  for (const message of visibleOptimisticMessages) {
    items.push(
      messageTimelineItem(
        message,
        sourceOrder,
        messageMetadata.get(message.id),
        turnDiffSummaryByAssistantMessageId.get(message.id) ?? null,
        revertTurnCountByUserMessageId.get(message.id) ?? null,
      ),
    )
    sourceOrder += 1
  }
  for (const plan of proposedPlans) {
    items.push(proposedPlanTimelineItem(plan, sourceOrder))
    sourceOrder += 1
  }
  for (const activity of workLogEntries) {
    items.push(activityTimelineItem(activity, sourceOrder))
    sourceOrder += 1
  }

  const timelineItems = groupActivityTimelineItems(items.toSorted(compareTimelineEntries))
  if (latestTurn?.state === 'running') {
    timelineItems.push(
      workingTimelineItem(latestTurn, chatActiveWorkLogPlan(workLogEntries, latestTurn.turnId)),
    )
  }

  return timelineItems
}

function latestTurnWorkLogEntryCount(
  entries: readonly ChatWorkLogEntry[],
  latestTurn: OrchestrationLatestTurn | null,
) {
  if (!latestTurn) return entries.length

  return entries.filter((entry) => entry.turnId === latestTurn.turnId).length
}

export function chatTimelineItemEstimate(item: ChatTimelineItem | undefined) {
  if (!item) return 64
  if (item.type === 'activity-group') return Math.min(220, 36 + item.activities.length * 28)
  if (item.type === 'proposed-plan') return 160
  if (item.type === 'working') return item.plan?.currentStep ? 72 : 52

  const dividerHeight = item.showCompletionDivider ? 34 : 0
  const changedFilesHeight =
    item.turnDiffSummary && item.turnDiffSummary.files.length > 0
      ? Math.min(220, 46 + item.turnDiffSummary.files.length * 24)
      : 0
  const messageHeight = Math.min(
    220,
    Math.max(56, 42 + Math.ceil(item.message.text.length / 48) * 18),
  )

  return dividerHeight + messageHeight + changedFilesHeight
}

function messageTimelineItem(
  message: OrchestrationMessage | OptimisticChatMessage,
  sourceOrder: number,
  metadata = fallbackChatMessageTimelineMetadata(message),
  turnDiffSummary: ChatTurnDiffSummary | null = null,
  revertTurnCount: number | null = null,
): ChronologicalTimelineItem {
  return {
    assistantStreaming: metadata.assistantStreaming,
    assistantTurnInProgress: metadata.assistantTurnInProgress,
    completionSummary: metadata.completionSummary,
    durationEnd: metadata.durationEnd,
    durationStart: metadata.durationStart,
    id: `message:${message.id}`,
    message,
    revertTurnCount,
    showAssistantCopyButton: metadata.showAssistantCopyButton,
    showCompletionDivider: metadata.showCompletionDivider,
    sourceOrder,
    timestamp: message.createdAt,
    turnDiffSummary,
    type: 'message',
  }
}

function activityTimelineItem(
  activity: ChatWorkLogEntry,
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

function workingTimelineItem(
  latestTurn: OrchestrationLatestTurn,
  plan: ChatWorkLogPlan | null,
): ChatTimelineItem {
  return {
    id: `working:${latestTurn.turnId}`,
    latestTurn,
    plan,
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
  let pendingActivities: ChatWorkLogEntry[] = []

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
      assistantStreaming: item.assistantStreaming,
      assistantTurnInProgress: item.assistantTurnInProgress,
      completionSummary: item.completionSummary,
      durationEnd: item.durationEnd,
      durationStart: item.durationStart,
      id: item.id,
      message: item.message,
      revertTurnCount: item.revertTurnCount,
      showAssistantCopyButton: item.showAssistantCopyButton,
      showCompletionDivider: item.showCompletionDivider,
      timestamp: item.timestamp,
      turnDiffSummary: item.turnDiffSummary,
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

function deriveTurnDiffSummaryByAssistantMessageId(
  summaries: readonly ChatTurnDiffSummary[],
  messages: readonly ChatTimelineMessage[],
) {
  const lastAssistantMessageIdByTurnId = new Map<string, string>()
  for (const message of messages.toSorted(compareMessagesByCreatedAt)) {
    if (message.role !== 'assistant') continue
    if (!message.turnId) continue

    lastAssistantMessageIdByTurnId.set(message.turnId, message.id)
  }

  const summaryByAssistantMessageId = new Map<string, ChatTurnDiffSummary>()
  for (const summary of summaries) {
    const assistantMessageId =
      summary.assistantMessageId ?? lastAssistantMessageIdByTurnId.get(summary.turnId)
    if (!assistantMessageId) continue

    summaryByAssistantMessageId.set(assistantMessageId, summary)
  }

  return summaryByAssistantMessageId
}

function deriveRevertTurnCountByUserMessageId(
  messages: readonly ChatTimelineMessage[],
  summaryByAssistantMessageId: ReadonlyMap<string, ChatTurnDiffSummary>,
) {
  const chronologicalMessages = messages.toSorted(compareMessagesByCreatedAt)
  const counts = new Map<string, number>()

  for (let index = 0; index < chronologicalMessages.length; index += 1) {
    const message = chronologicalMessages[index]
    if (!message || message.role !== 'user') continue

    const turnCount = revertTurnCountAfterUserMessage(
      chronologicalMessages,
      index,
      summaryByAssistantMessageId,
    )
    if (turnCount === null) continue

    counts.set(message.id, turnCount)
  }

  return counts
}

function revertTurnCountAfterUserMessage(
  messages: readonly ChatTimelineMessage[],
  userMessageIndex: number,
  summaryByAssistantMessageId: ReadonlyMap<string, ChatTurnDiffSummary>,
) {
  for (let index = userMessageIndex + 1; index < messages.length; index += 1) {
    const message = messages[index]
    if (!message) continue
    if (message.role === 'user') return null
    if (message.role !== 'assistant') continue

    const summary = summaryByAssistantMessageId.get(message.id)
    if (!summary) continue

    return Math.max(0, summary.checkpointTurnCount - 1)
  }

  return null
}

function compareMessagesByCreatedAt(left: ChatTimelineMessage, right: ChatTimelineMessage) {
  return left.createdAt.localeCompare(right.createdAt)
}

function appendActivityGroup(items: ChatTimelineItem[], activities: readonly ChatWorkLogEntry[]) {
  const firstActivity = activities[0]
  if (!firstActivity) return

  items.push({
    activities: [...activities],
    id: `activity-group:${firstActivity.id}`,
    timestamp: firstActivity.createdAt,
    type: 'activity-group',
  })
}
