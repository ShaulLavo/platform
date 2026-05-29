import type { ThreadId } from '@workspace/contracts'
import { useEffect, useMemo, useState } from 'react'

import type { ChatEnvironment } from '../environment/chat-environment'
import {
  createCheckpointRevertCommand,
  createThreadInterruptCommand,
  createTurnSubmission,
} from '../lib/chat-command-builders'
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
import { ChatRuntimeStatus } from './chat-runtime-status'
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
  const [interrupting, setInterrupting] = useState(false)
  const [revertingCheckpoint, setRevertingCheckpoint] = useState(false)
  const [sending, setSending] = useState(false)
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
    setSending(true)
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
    } finally {
      setSending(false)
    }
  }

  async function handleStop() {
    if (!thread) return

    setInterrupting(true)
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
      setInterrupting(false)
    }
  }

  async function handleRevertToCheckpoint(turnCount: number) {
    if (!thread) return
    if (busy) {
      setSendError('Interrupt the current turn before reverting checkpoints.')
      return
    }
    if (!confirmCheckpointRevert(turnCount)) return

    setRevertingCheckpoint(true)
    setSendError(null)
    try {
      const command = createCheckpointRevertCommand({
        createdAt: new Date().toISOString(),
        threadId: thread.id,
        turnCount,
      })
      logChatPipelineInfo('chat.checkpoint_revert.dispatch.start', chatCommandSummary(command))
      const result = await environment.dispatchCommand(command)
      logChatPipelineInfo('chat.checkpoint_revert.dispatch.accepted', {
        ...chatCommandSummary(command),
        deduped: result.deduped,
        sequence: result.sequence,
      })
      scheduleThreadProjectionSyncAfterDispatch({
        environment,
        replayAfterSequence: Math.max(0, result.sequence - 2),
        threadId: thread.id,
      })
    } catch (error) {
      logChatPipelineWarn('chat.checkpoint_revert.dispatch.failed', {
        error,
        threadId: thread.id,
        turnCount,
      })
      setSendError(chatViewErrorMessage(error))
    } finally {
      setRevertingCheckpoint(false)
    }
  }

  return (
    <section className='flex min-h-0 flex-1 flex-col'>
      <ChatRuntimeStatus
        commandFailure={sendError}
        interruptPending={interrupting}
        sendPending={sending}
        stopPending={false}
        thread={thread}
      />
      <MessagesTimeline
        checkpointRevertPending={revertingCheckpoint}
        optimisticMessages={optimisticMessages}
        thread={thread}
        onRevertToCheckpoint={handleRevertToCheckpoint}
      />
      <ChatInput
        busy={busy}
        commandStatusLabel={interrupting ? 'Interrupting' : null}
        disabled={interrupting}
        draftKey={thread.id}
        error={null}
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

function confirmCheckpointRevert(turnCount: number) {
  if (typeof window === 'undefined') return true
  if (typeof window.confirm !== 'function') return true

  return window.confirm(
    [
      `Revert this thread to checkpoint ${turnCount}?`,
      'This will discard newer messages and turn diffs in this thread.',
      'This action cannot be undone.',
    ].join('\n'),
  )
}

function chatViewErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message

  return 'Chat command failed.'
}
