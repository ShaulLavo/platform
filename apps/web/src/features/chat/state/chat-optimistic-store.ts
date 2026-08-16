import type { CommandId, MessageId, OrchestrationMessage, ThreadId } from '@workspace/contracts'
import { Debouncer } from '@tanstack/react-pacer/debouncer'
import { create } from 'zustand'

import {
  createChatPipelineScope,
  optimisticMessageSummary,
  type ChatPipelineScope,
} from '../lib/chat-pipeline-logging'

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
    resolvedMessages: readonly OrchestrationMessage[],
  ) => void
  removeOptimisticMessage: (threadId: ThreadId, messageId: MessageId) => void
}

export type ChatOptimisticStore = ChatOptimisticState & ChatOptimisticActions

const EMPTY_OPTIMISTIC_MESSAGES: OptimisticChatMessage[] = []
const CHAT_OPTIMISTIC_LOG_FLUSH_MS = 250

let optimisticLogScope: ChatPipelineScope | null = null
const optimisticLogFlush = new Debouncer(flushOptimisticLogScope, {
  wait: CHAT_OPTIMISTIC_LOG_FLUSH_MS,
})

export const useChatOptimisticStore = create<ChatOptimisticStore>((set, get) => ({
  messagesByThreadId: {},
  addOptimisticMessage: (commandId, message) => {
    recordOptimisticMutation(
      'add',
      optimisticMessageSummary({
        commandId,
        messageId: message.id,
        textLength: message.text.length,
        threadId: message.threadId,
      }),
    )

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
  clearResolvedOptimisticMessages: (threadId, resolvedMessages) => {
    // Runs once per streamed token delta. An optimistic message only exists in the
    // window between send and the server's echo, and `replaceThreadMessages` drops
    // the thread key when the last one resolves — so this bail is the common case,
    // and it has to happen before the id set is built and before the log scope is
    // touched, or a streaming turn drives the debouncer per token.
    if (!get().messagesByThreadId[threadId]) return

    const resolvedMessageIds = new Set(resolvedMessages.map((message) => message.id))
    recordOptimisticMutation('clearResolved', {
      resolvedMessageCount: resolvedMessageIds.size,
      threadId,
    })
    set((state) => clearResolvedMessages(state, threadId, resolvedMessageIds))
  },
  removeOptimisticMessage: (threadId, messageId) => {
    recordOptimisticMutation('remove', { messageId, threadId })
    set((state) => removeOptimisticMessage(state, threadId, messageId))
  },
}))

function recordOptimisticMutation(kind: string, context: Record<string, unknown>) {
  const scope = currentOptimisticLogScope()
  scope.increment('optimistic.mutationCount')
  scope.increment(`optimistic.${kind}Count`)
  scope.set({
    optimistic: {
      latest: {
        kind,
        ...context,
      },
    },
  })
  optimisticLogFlush.maybeExecute()
}

function currentOptimisticLogScope() {
  if (optimisticLogScope) return optimisticLogScope

  optimisticLogScope = createChatPipelineScope('chat.optimistic.summary')
  return optimisticLogScope
}

function flushOptimisticLogScope() {
  const scope = optimisticLogScope
  optimisticLogScope = null
  scope?.end()
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
