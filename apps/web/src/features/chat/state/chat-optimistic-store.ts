import type { CommandId, MessageId, OrchestrationMessage, ThreadId } from '@workspace/contracts'
import { create } from 'zustand'

import { logChatPipelineDebug, optimisticMessageSummary } from '../lib/chat-pipeline-logging'

export type OptimisticChatMessage = OrchestrationMessage & {
  commandId: CommandId
  optimistic: true
}

type ChatOptimisticState = {
  messagesByThreadId: Record<ThreadId, Record<MessageId, OptimisticChatMessage>>
}

type ChatOptimisticActions = {
  addOptimisticMessage: (commandId: CommandId, message: OrchestrationMessage) => void
  clearResolvedOptimisticMessages: (
    threadId: ThreadId,
    resolvedMessageIds: ReadonlySet<MessageId>,
  ) => void
  removeOptimisticMessage: (threadId: ThreadId, messageId: MessageId) => void
}

export type ChatOptimisticStore = ChatOptimisticState & ChatOptimisticActions

const EMPTY_OPTIMISTIC_MESSAGES: OptimisticChatMessage[] = []

export const useChatOptimisticStore = create<ChatOptimisticStore>((set) => ({
  messagesByThreadId: {},
  addOptimisticMessage: (commandId, message) => {
    logChatPipelineDebug('chat.optimistic.add', {
      ...optimisticMessageSummary({
        commandId,
        messageId: message.id,
        textLength: message.text.length,
        threadId: message.threadId,
      }),
    })

    set((state) => ({
      messagesByThreadId: {
        ...state.messagesByThreadId,
        [message.threadId]: {
          ...state.messagesByThreadId[message.threadId],
          [message.id]: {
            ...message,
            commandId,
            optimistic: true,
          },
        },
      },
    }))
  },
  clearResolvedOptimisticMessages: (threadId, resolvedMessageIds) => {
    logChatPipelineDebug('chat.optimistic.clear_resolved', {
      resolvedMessageCount: resolvedMessageIds.size,
      threadId,
    })
    set((state) => clearResolvedMessages(state, threadId, resolvedMessageIds))
  },
  removeOptimisticMessage: (threadId, messageId) => {
    logChatPipelineDebug('chat.optimistic.remove', { messageId, threadId })
    set((state) => removeOptimisticMessage(state, threadId, messageId))
  },
}))

export function selectOptimisticMessagesForThread(
  state: ChatOptimisticStore,
  threadId: ThreadId | null | undefined,
) {
  if (!threadId) return EMPTY_OPTIMISTIC_MESSAGES

  const messages = state.messagesByThreadId[threadId]
  if (!messages) return EMPTY_OPTIMISTIC_MESSAGES

  return Object.values(messages)
}

export function createOptimisticMessagesForThreadSelector(threadId: ThreadId | null | undefined) {
  let previousMessagesById: Record<MessageId, OptimisticChatMessage> | undefined
  let previousMessages: OptimisticChatMessage[] = EMPTY_OPTIMISTIC_MESSAGES

  return (state: ChatOptimisticStore) => {
    if (!threadId) return EMPTY_OPTIMISTIC_MESSAGES

    const messagesById = state.messagesByThreadId[threadId]
    if (!messagesById) return EMPTY_OPTIMISTIC_MESSAGES
    if (previousMessagesById === messagesById) return previousMessages

    previousMessagesById = messagesById
    previousMessages = Object.values(messagesById)

    return previousMessages
  }
}

function clearResolvedMessages(
  state: ChatOptimisticState,
  threadId: ThreadId,
  resolvedMessageIds: ReadonlySet<MessageId>,
): ChatOptimisticState {
  const messages = state.messagesByThreadId[threadId]
  if (!messages) return state

  const nextMessages = Object.fromEntries(
    Object.entries(messages).filter(
      ([messageId]) => !resolvedMessageIds.has(messageId as MessageId),
    ),
  ) as Record<MessageId, OptimisticChatMessage>
  if (Object.keys(nextMessages).length === Object.keys(messages).length) return state

  return replaceThreadMessages(state, threadId, nextMessages)
}

function removeOptimisticMessage(
  state: ChatOptimisticState,
  threadId: ThreadId,
  messageId: MessageId,
): ChatOptimisticState {
  const messages = state.messagesByThreadId[threadId]
  if (!messages?.[messageId]) return state

  const { [messageId]: _removed, ...nextMessages } = messages

  return replaceThreadMessages(
    state,
    threadId,
    nextMessages as Record<MessageId, OptimisticChatMessage>,
  )
}

function replaceThreadMessages(
  state: ChatOptimisticState,
  threadId: ThreadId,
  messages: Record<MessageId, OptimisticChatMessage>,
): ChatOptimisticState {
  if (Object.keys(messages).length > 0) {
    return {
      ...state,
      messagesByThreadId: {
        ...state.messagesByThreadId,
        [threadId]: messages,
      },
    }
  }

  const { [threadId]: _removedThread, ...messagesByThreadId } = state.messagesByThreadId

  return {
    ...state,
    messagesByThreadId: messagesByThreadId as ChatOptimisticState['messagesByThreadId'],
  }
}
