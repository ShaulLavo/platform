import type { ThreadId } from '@workspace/contracts'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { errorMessage } from '@/lib/error-message'
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
  createChatPipelineScope,
  optimisticMessageSummary,
} from '../lib/chat-pipeline-logging'
import { isChatThreadBusy } from '../lib/chat-thread-status'
import { createChatThreadSelector } from '../state/chat-projection-selectors'
import {
  createOptimisticMessagesForThreadSelector,
  useChatOptimisticStore,
} from '../state/chat-optimistic-store'
import { type ChatThread, useChatProjectionStore } from '../state/chat-projection-store'
import { retainThreadDetailSubscription } from '../state/thread-detail-subscriptions'
import { ChatInput, type ChatInputSubmitPayload } from './chat-input'
import { ChatRuntimeStatus } from './chat-runtime-status'
import { MessagesTimeline } from './messages-timeline'
import { ChatTimelineActionsProvider } from '../providers/timeline-actions-provider'

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
  // Stable identity is required because this is part of the timeline action context value.
  const handleRevertToCheckpoint = useCallback(
    async (turnCount: number) => {
      if (!thread) return
      if (busy) {
        setSendError('Interrupt the current turn before reverting checkpoints.')
        return
      }
      if (!confirmCheckpointRevert(turnCount)) return

      await revertThreadToCheckpoint({
        environment,
        setRevertingCheckpoint,
        setSendError,
        thread,
        turnCount,
      })
    },
    [busy, environment, thread],
  )

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

  async function handleSend(payload: ChatInputSubmitPayload) {
    if (!thread) return false

    return submitChatTurn({ environment, payload, setSendError, setSending, thread })
  }

  async function handleStop() {
    if (!thread) return

    await dispatchThreadStop({ environment, setInterrupting, setSendError, thread })
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
      <ChatTimelineActionsProvider revertToCheckpoint={handleRevertToCheckpoint}>
        <MessagesTimeline
          checkpointRevertPending={revertingCheckpoint}
          optimisticMessages={optimisticMessages}
          thread={thread}
        />
      </ChatTimelineActionsProvider>
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

async function submitChatTurn({
  environment,
  payload,
  setSendError,
  setSending,
  thread,
}: {
  environment: ChatEnvironment
  payload: ChatInputSubmitPayload
  setSendError: (value: string | null) => void
  setSending: (value: boolean) => void
  thread: ChatThread
}): Promise<boolean> {
  const { attachments, interactionMode, modelSelection, runtimeMode, text } = payload
  const submission = createTurnSubmission({
    attachments,
    createdAt: new Date().toISOString(),
    interactionMode,
    modelSelection,
    runtimeMode,
    text,
    threadId: thread.id,
  })
  const startedAt = performance.now()
  const scope = createChatPipelineScope('chat.command.dispatch.summary', {
    ...chatCommandSummary(submission.command),
    attachmentCount: attachments.length,
    interactionMode,
    model: modelSelection.model,
    providerInstanceId: modelSelection.providerInstanceId,
    runtimeMode,
    textLength: text.length,
  })

  scope.increment('command.submitCount')
  useChatOptimisticStore
    .getState()
    .addOptimisticMessage(submission.command.commandId, submission.optimisticMessage)
  scope.increment('command.optimisticAddedCount')
  scope.set({
    optimistic: optimisticMessageSummary({
      commandId: submission.command.commandId,
      messageId: submission.optimisticMessage.id,
      textLength: text.length,
      threadId: thread.id,
    }),
  })
  setSendError(null)
  setSending(true)
  try {
    scope.increment('command.dispatchStartCount')
    const result = await environment.dispatchCommand(submission.command)
    scope.increment('command.dispatchAcceptedCount')
    scope.set({
      deduped: result.deduped,
      outcome: 'ok',
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
    scope.increment('command.dispatchFailedCount')
    scope.warn('Chat command dispatch failed.', { error })
    scope.set({ outcome: 'error' })
    setSendError(errorMessage(error, 'Chat command failed.'))
    return false
  } finally {
    scope.end({ durationMs: elapsedMs(startedAt) })
    setSending(false)
  }
}

async function dispatchThreadStop({
  environment,
  setInterrupting,
  setSendError,
  thread,
}: {
  environment: ChatEnvironment
  setInterrupting: (value: boolean) => void
  setSendError: (value: string | null) => void
  thread: ChatThread
}) {
  setInterrupting(true)
  const startedAt = performance.now()
  const command = createThreadInterruptCommand({
    createdAt: new Date().toISOString(),
    threadId: thread.id,
    turnId: thread.latestTurn?.turnId,
  })
  const scope = createChatPipelineScope('chat.stop.dispatch.summary', chatCommandSummary(command))
  try {
    scope.increment('command.dispatchStartCount')
    await environment.dispatchCommand(command)
    scope.increment('command.dispatchAcceptedCount')
    scope.set({ outcome: 'ok' })
  } catch (error) {
    scope.increment('command.dispatchFailedCount')
    scope.warn('Stop command dispatch failed.', { error })
    scope.set({ outcome: 'error' })
    setSendError(errorMessage(error, 'Chat command failed.'))
  } finally {
    scope.end({ durationMs: elapsedMs(startedAt) })
    setInterrupting(false)
  }
}

async function revertThreadToCheckpoint({
  environment,
  setRevertingCheckpoint,
  setSendError,
  thread,
  turnCount,
}: {
  environment: ChatEnvironment
  setRevertingCheckpoint: (value: boolean) => void
  setSendError: (value: string | null) => void
  thread: ChatThread
  turnCount: number
}) {
  setRevertingCheckpoint(true)
  setSendError(null)
  const startedAt = performance.now()
  const command = createCheckpointRevertCommand({
    createdAt: new Date().toISOString(),
    threadId: thread.id,
    turnCount,
  })
  const scope = createChatPipelineScope(
    'chat.checkpoint_revert.dispatch.summary',
    chatCommandSummary(command),
  )
  try {
    scope.increment('command.dispatchStartCount')
    const result = await environment.dispatchCommand(command)
    scope.increment('command.dispatchAcceptedCount')
    scope.set({
      deduped: result.deduped,
      outcome: 'ok',
      sequence: result.sequence,
    })
    scheduleThreadProjectionSyncAfterDispatch({
      environment,
      replayAfterSequence: Math.max(0, result.sequence - 2),
      threadId: thread.id,
    })
  } catch (error) {
    scope.increment('command.dispatchFailedCount')
    scope.warn('Checkpoint revert command dispatch failed.', { error })
    scope.set({ outcome: 'error' })
    setSendError(errorMessage(error, 'Chat command failed.'))
  } finally {
    scope.end({ durationMs: elapsedMs(startedAt) })
    setRevertingCheckpoint(false)
  }
}

function elapsedMs(startedAt: number) {
  return Math.round((performance.now() - startedAt) * 100) / 100
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
