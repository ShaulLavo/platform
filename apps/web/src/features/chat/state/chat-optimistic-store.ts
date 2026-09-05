import {
  scopedSessionKey,
  type ScopedSessionRef,
  type EnvironmentId,
  type CommandId,
  type MessageId,
  type OrchestrationMessage,
} from '@workspace/contracts'
import { Debouncer } from '@tanstack/react-pacer/debouncer'
import { create } from 'zustand'

import {
  createChatPipelineScope,
  optimisticMessageSummary,
  type ChatPipelineScope,
} from '@/features/chat/utils/pipeline-logging'

export type OptimisticChatMessage = OrchestrationMessage & {
  commandId: CommandId
  optimistic: true
}

type ChatOptimisticState = {
  messagesBySessionKey: Record<string, Record<MessageId, OptimisticChatMessage>>
}

type ChatOptimisticActions = {
  addOptimisticMessage: (
    environmentId: EnvironmentId,
    commandId: CommandId,
    message: OrchestrationMessage,
  ) => void
  clearResolvedOptimisticMessages: (
    ref: ScopedSessionRef,
    resolvedMessages: readonly OrchestrationMessage[],
  ) => void
  removeOptimisticMessage: (ref: ScopedSessionRef, messageId: MessageId) => void
}

export type ChatOptimisticStore = ChatOptimisticState & ChatOptimisticActions

const EMPTY_OPTIMISTIC_MESSAGES: OptimisticChatMessage[] = []
const CHAT_OPTIMISTIC_LOG_FLUSH_MS = 250

let optimisticLogScope: ChatPipelineScope | null = null
const optimisticLogFlush = new Debouncer(flushOptimisticLogScope, {
  wait: CHAT_OPTIMISTIC_LOG_FLUSH_MS,
})

export const useChatOptimisticStore = create<ChatOptimisticStore>((set, get) => ({
  messagesBySessionKey: {},
  addOptimisticMessage: (environmentId, commandId, message) => {
    const sessionKey = scopedSessionKey({ environmentId, sessionId: message.sessionId })
    recordOptimisticMutation(
      'add',
      optimisticMessageSummary({
        commandId,
        messageId: message.id,
        textLength: message.text.length,
        sessionId: message.sessionId,
      }),
    )

    set((state) => ({
      messagesBySessionKey: {
        ...state.messagesBySessionKey,
        [sessionKey]: {
          ...state.messagesBySessionKey[sessionKey],
          [message.id]: {
            ...message,
            commandId,
            optimistic: true,
          },
        },
      },
    }))
  },
  clearResolvedOptimisticMessages: (ref, resolvedMessages) => {
    const sessionId = scopedSessionKey(ref)
    // Most streamed deltas have no optimistic message to reconcile.
    if (!get().messagesBySessionKey[sessionId]) return

    const resolvedMessageIds = new Set(resolvedMessages.map((message) => message.id))
    recordOptimisticMutation('clearResolved', {
      resolvedMessageCount: resolvedMessageIds.size,
      sessionId,
    })
    set((state) => clearResolvedMessages(state, sessionId, resolvedMessageIds))
  },
  removeOptimisticMessage: (ref, messageId) => {
    const sessionId = scopedSessionKey(ref)
    recordOptimisticMutation('remove', { messageId, sessionId })
    set((state) => removeOptimisticMessage(state, sessionId, messageId))
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

export function createOptimisticMessagesForSessionSelector(
  ref: ScopedSessionRef | null | undefined,
) {
  const sessionId = ref ? scopedSessionKey(ref) : null
  let previousMessagesById: Record<MessageId, OptimisticChatMessage> | undefined
  let previousMessages: OptimisticChatMessage[] = EMPTY_OPTIMISTIC_MESSAGES

  return (state: ChatOptimisticStore) => {
    if (!sessionId) return EMPTY_OPTIMISTIC_MESSAGES

    const messagesById = state.messagesBySessionKey[sessionId]
    if (!messagesById) return EMPTY_OPTIMISTIC_MESSAGES
    if (previousMessagesById === messagesById) return previousMessages

    previousMessagesById = messagesById
    previousMessages = Object.values(messagesById)

    return previousMessages
  }
}

function clearResolvedMessages(
  state: ChatOptimisticState,
  sessionId: string,
  resolvedMessageIds: ReadonlySet<MessageId>,
): ChatOptimisticState {
  const messages = state.messagesBySessionKey[sessionId]
  if (!messages) return state

  const nextMessages = Object.fromEntries(
    Object.entries(messages).filter(
      ([messageId]) => !resolvedMessageIds.has(messageId as MessageId),
    ),
  ) as Record<MessageId, OptimisticChatMessage>
  if (Object.keys(nextMessages).length === Object.keys(messages).length) return state

  return replaceSessionMessages(state, sessionId, nextMessages)
}

function removeOptimisticMessage(
  state: ChatOptimisticState,
  sessionId: string,
  messageId: MessageId,
): ChatOptimisticState {
  const messages = state.messagesBySessionKey[sessionId]
  if (!messages?.[messageId]) return state

  const { [messageId]: _removed, ...nextMessages } = messages

  return replaceSessionMessages(
    state,
    sessionId,
    nextMessages as Record<MessageId, OptimisticChatMessage>,
  )
}

function replaceSessionMessages(
  state: ChatOptimisticState,
  sessionId: string,
  messages: Record<MessageId, OptimisticChatMessage>,
): ChatOptimisticState {
  if (Object.keys(messages).length > 0) {
    return {
      ...state,
      messagesBySessionKey: {
        ...state.messagesBySessionKey,
        [sessionId]: messages,
      },
    }
  }

  const { [sessionId]: _removedSession, ...messagesBySessionKey } = state.messagesBySessionKey

  return {
    ...state,
    messagesBySessionKey: messagesBySessionKey as ChatOptimisticState['messagesBySessionKey'],
  }
}
