import type { OrchestrationLatestTurn, OrchestrationMessage } from '@workspace/contracts'

import type { OptimisticChatMessage } from '../state/chat-optimistic-store'
import { formatChatElapsed } from './chat-formatters'

export type ChatTimelineMessage = OrchestrationMessage | OptimisticChatMessage

export type ChatMessageTimelineMetadata = {
  assistantStreaming: boolean
  assistantTurnInProgress: boolean
  completionSummary: string | null
  durationEnd: string
  durationStart: string
  showAssistantCopyButton: boolean
  showCompletionDivider: boolean
}

export function chatMessageTimelineMetadata({
  latestTurn,
  messages,
  showCompletionSummary = true,
}: {
  latestTurn: OrchestrationLatestTurn | null
  messages: readonly ChatTimelineMessage[]
  showCompletionSummary?: boolean
}) {
  const orderedMessages = messages.toSorted(compareMessagesByCreatedAt)
  const durationStartByMessageId = computeMessageDurationStart(orderedMessages)
  const terminalAssistantMessageIds = deriveTerminalAssistantMessageIds(orderedMessages)
  const completionSummary =
    showCompletionSummary && latestTurn?.startedAt && latestTurn.completedAt
      ? formatCompletionSummary(latestTurn.startedAt, latestTurn.completedAt)
      : null
  const completionDividerMessageId = completionSummary
    ? deriveCompletionDividerMessageId(orderedMessages, latestTurn)
    : null
  const metadataByMessageId = new Map<string, ChatMessageTimelineMetadata>()

  for (const message of messages) {
    const assistantTurnInProgress = isAssistantTurnInProgress(message, latestTurn)
    metadataByMessageId.set(message.id, {
      assistantStreaming: isAssistantMessageStreaming(message, latestTurn),
      assistantTurnInProgress,
      completionSummary,
      durationEnd: durationEndForMessage(message, latestTurn, completionDividerMessageId),
      durationStart: durationStartByMessageId.get(message.id) ?? message.createdAt,
      showAssistantCopyButton:
        message.role === 'assistant' && terminalAssistantMessageIds.has(message.id),
      showCompletionDivider:
        message.role === 'assistant' && completionDividerMessageId === message.id,
    })
  }

  return metadataByMessageId
}

export function fallbackChatMessageTimelineMetadata(
  message: ChatTimelineMessage,
): ChatMessageTimelineMetadata {
  return {
    assistantStreaming: message.streaming,
    assistantTurnInProgress: false,
    completionSummary: null,
    durationEnd: message.updatedAt,
    durationStart: message.createdAt,
    showAssistantCopyButton: false,
    showCompletionDivider: false,
  }
}

export function resolveAssistantMessageCopyState({
  showCopyButton,
  streaming,
  text,
}: {
  showCopyButton: boolean
  streaming: boolean
  text: string | null
}) {
  const copyText = text?.trim() ? text : null

  return {
    text: copyText,
    visible: showCopyButton && copyText !== null && !streaming,
  }
}

function computeMessageDurationStart(messages: readonly ChatTimelineMessage[]) {
  const result = new Map<string, string>()
  let lastBoundary: string | null = null

  for (const message of messages) {
    if (message.role === 'user') {
      lastBoundary = message.createdAt
    }
    result.set(message.id, lastBoundary ?? message.createdAt)
    if (message.role === 'assistant' && !message.streaming) {
      lastBoundary = assistantCompletionBoundary(message)
    }
  }

  return result
}

function assistantCompletionBoundary(message: ChatTimelineMessage) {
  const completedAt = (message as { completedAt?: unknown }).completedAt
  if (typeof completedAt === 'string') return completedAt

  return message.updatedAt
}

function deriveTerminalAssistantMessageIds(messages: readonly ChatTimelineMessage[]) {
  const lastAssistantMessageIdByResponseKey = new Map<string, string>()
  let unkeyedResponseIndex = 0

  for (const message of messages) {
    if (message.role === 'user') {
      unkeyedResponseIndex += 1
      continue
    }
    if (message.role !== 'assistant') continue

    const responseKey = message.turnId
      ? `turn:${message.turnId}`
      : `unkeyed:${unkeyedResponseIndex}`
    lastAssistantMessageIdByResponseKey.set(responseKey, message.id)
  }

  return new Set(lastAssistantMessageIdByResponseKey.values())
}

function deriveCompletionDividerMessageId(
  messages: readonly ChatTimelineMessage[],
  latestTurn: OrchestrationLatestTurn | null,
) {
  if (!latestTurn?.startedAt) return null
  if (!latestTurn.completedAt) return null

  if (latestTurn.assistantMessageId) {
    const exactMatch = messages.find(
      (message) => message.role === 'assistant' && message.id === latestTurn.assistantMessageId,
    )
    if (exactMatch) return exactMatch.id
  }

  const turnStartedAt = Date.parse(latestTurn.startedAt)
  const turnCompletedAt = Date.parse(latestTurn.completedAt)
  if (Number.isNaN(turnStartedAt)) return null
  if (Number.isNaN(turnCompletedAt)) return null

  let inRangeMatch: string | null = null
  let fallbackMatch: string | null = null
  for (const message of messages) {
    if (message.role !== 'assistant') continue

    const messageAt = Date.parse(message.createdAt)
    if (Number.isNaN(messageAt)) continue
    if (messageAt < turnStartedAt) continue

    fallbackMatch = message.id
    if (messageAt <= turnCompletedAt) {
      inRangeMatch = message.id
    }
  }

  return inRangeMatch ?? fallbackMatch
}

function isAssistantTurnInProgress(
  message: ChatTimelineMessage,
  latestTurn: OrchestrationLatestTurn | null,
) {
  if (message.role !== 'assistant') return false
  if (!message.turnId) return false
  if (latestTurn?.turnId !== message.turnId) return false

  return latestTurn.state === 'running' && latestTurn.completedAt === null
}

function isAssistantMessageStreaming(
  message: ChatTimelineMessage,
  latestTurn: OrchestrationLatestTurn | null,
) {
  if (message.role !== 'assistant') return message.streaming
  if (!message.streaming) return false
  if (!message.turnId) return true

  return isAssistantTurnInProgress(message, latestTurn)
}

function durationEndForMessage(
  message: ChatTimelineMessage,
  latestTurn: OrchestrationLatestTurn | null,
  completionDividerMessageId: string | null,
) {
  if (message.role !== 'assistant') return message.updatedAt
  if (message.id === completionDividerMessageId && latestTurn?.completedAt) {
    return latestTurn.completedAt
  }

  return assistantCompletionBoundary(message)
}

function compareMessagesByCreatedAt(left: ChatTimelineMessage, right: ChatTimelineMessage) {
  return left.createdAt.localeCompare(right.createdAt)
}

function formatCompletionSummary(startIso: string, endIso: string) {
  const elapsed = formatChatElapsed(startIso, endIso)
  if (!elapsed) return null

  return `Worked for ${elapsed}`
}
