import type { ModelSelection, ThreadId } from '@workspace/contracts'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { notifyChatCommandError } from '@/features/chat/notify-command-error'
import type { ChatTransport } from '@/features/chat/transport/chat-transport'
import {
  createCheckpointRevertCommand,
  createProjectDefaultModelCommand,
  createThreadInterruptCommand,
  createTurnSubmission,
} from '@/features/chat/utils/command-builders'
import { dispatchChatCommand, replayAfterDispatch } from '@/features/chat/utils/command-dispatch'
import { scheduleThreadProjectionSyncAfterDispatch } from '@/features/chat/utils/command-sync'
import { optimisticMessageSummary } from '@/features/chat/utils/pipeline-logging'
import { isChatThreadBusy } from '@/features/chat/utils/thread-busy'
import { createChatThreadSelector } from '../state/chat-projection-selectors'
import {
  createOptimisticMessagesForThreadSelector,
  useChatOptimisticStore,
} from '../state/chat-optimistic-store'
import { type ChatThread, useChatProjectionStore } from '../state/chat-projection-store'
import { ChatTransportContext } from '@/features/chat/providers/transport-context'
import { ChatInput, type ChatInputSubmitPayload } from './chat-input'
import { ChatRuntimeStatus } from './chat-runtime-status'
import { MessagesTimeline } from './messages-timeline'
import { PendingApprovalPanel } from './pending-approval-panel'
import { PendingUserInputPanel } from './pending-user-input-panel'
import { PlanFollowUpBanner } from './plan-follow-up-banner'
import { ChatComposerModesProvider } from '../providers/composer-modes-provider'
import { ChatPendingRequestsProvider } from '../providers/pending-requests-provider'
import { ChatPlanFollowUpProvider } from '../providers/plan-follow-up-provider'
import { ChatTimelineActionsProvider } from '../providers/timeline-actions-provider'
import type { ChatInputDraftTarget } from '../state/chat-input-draft-store'

export function ChatView({
  activeThreadId,
  transport,
  onThreadCreated,
  rootPath,
}: {
  activeThreadId: ThreadId | null
  transport: ChatTransport
  /**
   * Puts a thread this view created — splitting a plan off to build it — on
   * screen. Each host keeps its own selection, so only it can honour this.
   */
  onThreadCreated: (threadId: ThreadId) => void
  rootPath: string
}) {
  const threadSelector = useMemo(() => createChatThreadSelector(activeThreadId), [activeThreadId])
  const optimisticMessagesSelector = useMemo(
    () => createOptimisticMessagesForThreadSelector(activeThreadId),
    [activeThreadId],
  )
  // The same target ChatInput builds for itself, so a mode pick lands on the
  // draft the send path reads. Stable identity is required: it feeds the
  // composer modes context value.
  const draftTarget = useMemo<ChatInputDraftTarget>(
    () => ({ draftKey: activeThreadId, rootPath }),
    [activeThreadId, rootPath],
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
        transport,
        setRevertingCheckpoint,
        setSendError,
        thread,
        turnCount,
      })
    },
    [busy, transport, thread],
  )

  const projectId = thread?.projectId
  // Stable identity is required because this is part of the model picker context value.
  const handlePersistModelSelection = useCallback(
    (next: ModelSelection) => {
      if (!projectId) return

      void dispatchChatCommand({
        action: 'chat.project.default_model.set',
        command: createProjectDefaultModelCommand({
          defaultModelSelection: next,
          projectId,
        }),
        dispatchCommand: transport.dispatchCommand,
        onFailed: (error) => notifyChatCommandError(error, 'Could not save the default model'),
      })
    },
    [transport, projectId],
  )

  useEffect(() => {
    if (!activeThreadId) return

    return transport.retainThreadDetail(activeThreadId)
  }, [activeThreadId, transport])

  useEffect(() => {
    if (!thread) return

    useChatOptimisticStore.getState().clearResolvedOptimisticMessages(thread.id, thread.messages)
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

    return submitChatTurn({ transport, payload, setSendError, setSending, thread })
  }

  async function handleStop() {
    if (!thread) return

    await dispatchThreadStop({ transport, setInterrupting, setSendError, thread })
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
      <ChatTransportContext value={transport}>
        <ChatTimelineActionsProvider revertToCheckpoint={handleRevertToCheckpoint}>
          <MessagesTimeline
            checkpointRevertPending={revertingCheckpoint}
            optimisticMessages={optimisticMessages}
            thread={thread}
          />
        </ChatTimelineActionsProvider>
      </ChatTransportContext>
      {/* The panels sit above the composer rather than inside it: each one is a
          request holding the turn open, so it stays visible while the user
          types their answer. */}
      <ChatComposerModesProvider
        dispatchCommand={transport.dispatchCommand}
        draftTarget={draftTarget}
        threadId={thread.id}
      >
        <ChatPendingRequestsProvider
          dispatchCommand={transport.dispatchCommand}
          threadId={thread.id}
        >
          <PendingApprovalPanel />
          <PendingUserInputPanel />
          <ChatPlanFollowUpProvider
            draftTarget={draftTarget}
            transport={transport}
            onThreadCreated={onThreadCreated}
            threadId={thread.id}
          >
            <PlanFollowUpBanner draftTarget={draftTarget} />
          </ChatPlanFollowUpProvider>
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
            onPersistModelSelection={handlePersistModelSelection}
            onStop={handleStop}
            onSubmit={handleSend}
          />
        </ChatPendingRequestsProvider>
      </ChatComposerModesProvider>
    </section>
  )
}

async function submitChatTurn({
  transport,
  payload,
  setSendError,
  setSending,
  thread,
}: {
  transport: ChatTransport
  payload: ChatInputSubmitPayload
  setSendError: (value: string | null) => void
  setSending: (value: boolean) => void
  thread: ChatThread
}): Promise<boolean> {
  const { attachments, interactionMode, modelSelection, runtimeMode, terminalContexts, text } =
    payload
  const submission = createTurnSubmission({
    attachments,
    createdAt: new Date().toISOString(),
    interactionMode,
    modelSelection,
    runtimeMode,
    terminalContexts,
    text,
    threadId: thread.id,
  })
  setSendError(null)
  setSending(true)
  try {
    const outcome = await dispatchChatCommand({
      action: 'chat.command.dispatch.summary',
      beforeDispatch: (scope) => {
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
      },
      command: submission.command,
      context: {
        attachmentCount: attachments.length,
        interactionMode,
        model: modelSelection.model,
        providerInstanceId: modelSelection.providerInstanceId,
        runtimeMode,
        terminalContextCount: terminalContexts.length,
        textLength: text.length,
      },
      dispatchCommand: transport.dispatchCommand,
      onAccepted: (result) =>
        scheduleThreadProjectionSyncAfterDispatch({
          transport,
          replayAfterSequence: replayAfterDispatch(submission.command, result),
          threadId: thread.id,
        }),
      onFailed: () =>
        useChatOptimisticStore
          .getState()
          .removeOptimisticMessage(thread.id, submission.optimisticMessage.id),
    })
    if (outcome.ok) return true

    setSendError(outcome.message)
    return false
  } finally {
    setSending(false)
  }
}

async function dispatchThreadStop({
  transport,
  setInterrupting,
  setSendError,
  thread,
}: {
  transport: ChatTransport
  setInterrupting: (value: boolean) => void
  setSendError: (value: string | null) => void
  thread: ChatThread
}) {
  setInterrupting(true)
  try {
    const outcome = await dispatchChatCommand({
      action: 'chat.stop.dispatch.summary',
      command: createThreadInterruptCommand({
        threadId: thread.id,
        turnId: thread.latestTurn?.turnId,
      }),
      dispatchCommand: transport.dispatchCommand,
    })
    if (!outcome.ok) setSendError(outcome.message)
  } finally {
    setInterrupting(false)
  }
}

async function revertThreadToCheckpoint({
  transport,
  setRevertingCheckpoint,
  setSendError,
  thread,
  turnCount,
}: {
  transport: ChatTransport
  setRevertingCheckpoint: (value: boolean) => void
  setSendError: (value: string | null) => void
  thread: ChatThread
  turnCount: number
}) {
  setRevertingCheckpoint(true)
  setSendError(null)
  const command = createCheckpointRevertCommand({ threadId: thread.id, turnCount })
  try {
    const outcome = await dispatchChatCommand({
      action: 'chat.checkpoint_revert.dispatch.summary',
      command,
      dispatchCommand: transport.dispatchCommand,
      onAccepted: (result) =>
        scheduleThreadProjectionSyncAfterDispatch({
          transport,
          replayAfterSequence: replayAfterDispatch(command, result),
          threadId: thread.id,
        }),
    })
    if (!outcome.ok) setSendError(outcome.message)
  } finally {
    setRevertingCheckpoint(false)
  }
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
