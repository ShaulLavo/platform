import type { ThreadId } from '@workspace/contracts'
import { useEffect, useMemo, useState } from 'react'

import type { ChatEnvironment } from '../environment/chat-environment'
import { createThreadInterruptCommand, createTurnSubmission } from '../lib/chat-command-builders'
import {
  replayAfterTurnDispatch,
  scheduleThreadProjectionSyncAfterDispatch,
} from '../lib/chat-command-sync'
import {
  chatCommandSummary,
  logChatPipelineInfo,
  logChatPipelineWarn,
  optimisticMessageSummary,
} from '../lib/chat-pipeline-logging'
import { isChatThreadBusy } from '../lib/chat-thread-status'
import { createChatThreadSelector } from '../state/chat-projection-selectors'
import {
  createOptimisticMessagesForThreadSelector,
  useChatOptimisticStore,
} from '../state/chat-optimistic-store'
import { useChatProjectionStore } from '../state/chat-projection-store'
import { retainThreadDetailSubscription } from '../state/thread-detail-subscriptions'
import { ChatInput, type ChatInputSubmitPayload } from './chat-input'
import { MessagesTimeline } from './messages-timeline'

export function ChatView({
  activeThreadId,
  environment,
  rootPath,
}: {
  activeThreadId: ThreadId | null
  environment: ChatEnvironment
  rootPath: string
}) {
  const threadSelector = useMemo(() => createChatThreadSelector(activeThreadId), [activeThreadId])
  const optimisticMessagesSelector = useMemo(
    () => createOptimisticMessagesForThreadSelector(activeThreadId),
    [activeThreadId],
  )
  const thread = useChatProjectionStore(threadSelector)
  const optimisticMessages = useChatOptimisticStore(optimisticMessagesSelector)
  const [sendError, setSendError] = useState<string | null>(null)
  const [stopping, setStopping] = useState(false)
  const busy = isChatThreadBusy(thread)

  useEffect(() => {
    if (!activeThreadId) return

    return retainThreadDetailSubscription(activeThreadId)
  }, [activeThreadId])

  useEffect(() => {
    if (!thread) return

    useChatOptimisticStore
      .getState()
      .clearResolvedOptimisticMessages(
        thread.id,
        new Set(thread.messages.map((message) => message.id)),
      )
  }, [thread])

  useEffect(() => {
    setSendError(null)
  }, [activeThreadId])

  if (!activeThreadId) {
    return (
      <div className='text-muted-foreground flex min-h-0 flex-1 items-center justify-center px-4 text-center text-xs'>
        Preparing workspace chat
      </div>
    )
  }
  if (!thread) {
    return (
      <div className='text-muted-foreground flex min-h-0 flex-1 items-center justify-center px-4 text-center text-xs'>
        Loading thread
      </div>
    )
  }

  async function handleSend({
    attachments,
    interactionMode,
    modelSelection,
    runtimeMode,
    text,
  }: ChatInputSubmitPayload) {
    if (!thread) return false

    const submission = createTurnSubmission({
      attachments,
      createdAt: new Date().toISOString(),
      interactionMode,
      modelSelection,
      runtimeMode,
      text,
      threadId: thread.id,
    })

    logChatPipelineInfo('chat.send.submit', {
      attachmentCount: attachments.length,
      interactionMode,
      model: modelSelection.model,
      providerInstanceId: modelSelection.providerInstanceId,
      runtimeMode,
      textLength: text.length,
      threadId: thread.id,
    })
    useChatOptimisticStore
      .getState()
      .addOptimisticMessage(submission.command.commandId, submission.optimisticMessage)
    logChatPipelineInfo('chat.optimistic.added_from_send', {
      ...optimisticMessageSummary({
        commandId: submission.command.commandId,
        messageId: submission.optimisticMessage.id,
        textLength: text.length,
        threadId: thread.id,
      }),
    })
    setSendError(null)
    try {
      logChatPipelineInfo('chat.command.dispatch.start', chatCommandSummary(submission.command))
      const result = await environment.dispatchCommand(submission.command)
      logChatPipelineInfo('chat.command.dispatch.accepted', {
        ...chatCommandSummary(submission.command),
        deduped: result.deduped,
        sequence: result.sequence,
      })
      scheduleThreadProjectionSyncAfterDispatch({
        environment,
        replayAfterSequence: replayAfterTurnDispatch(result),
        threadId: thread.id,
      })
      return true
    } catch (error) {
      useChatOptimisticStore
        .getState()
        .removeOptimisticMessage(thread.id, submission.optimisticMessage.id)
      logChatPipelineWarn('chat.command.dispatch.failed', {
        ...chatCommandSummary(submission.command),
        error,
      })
      setSendError(chatViewErrorMessage(error))
      return false
    }
  }

  async function handleStop() {
    if (!thread) return

    setStopping(true)
    try {
      const command = createThreadInterruptCommand({
        createdAt: new Date().toISOString(),
        threadId: thread.id,
        turnId: thread.latestTurn?.turnId,
      })
      logChatPipelineInfo('chat.stop.dispatch.start', chatCommandSummary(command))
      await environment.dispatchCommand(command)
      logChatPipelineInfo('chat.stop.dispatch.accepted', chatCommandSummary(command))
    } catch (error) {
      logChatPipelineWarn('chat.stop.dispatch.failed', {
        error,
        threadId: thread.id,
        turnId: thread.latestTurn?.turnId,
      })
      setSendError(chatViewErrorMessage(error))
    } finally {
      setStopping(false)
    }
  }

  return (
    <section className='flex min-h-0 flex-1 flex-col'>
      <MessagesTimeline optimisticMessages={optimisticMessages} thread={thread} />
      <ChatInput
        busy={busy}
        disabled={stopping}
        draftKey={thread.id}
        error={sendError ?? thread.session?.lastError ?? null}
        interactionMode={thread.interactionMode}
        modelSelection={thread.modelSelection}
        modelSelectionLocked={thread.messages.length > 0 || thread.latestTurn !== null}
        rootPath={rootPath}
        runtimeMode={thread.runtimeMode}
        onStop={handleStop}
        onSubmit={handleSend}
      />
    </section>
  )
}

function chatViewErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message

  return 'Chat command failed.'
}
