import {
  DEFAULT_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  type CommandId,
  type OrchestrationMessage,
  type OrchestrationProjectShell,
  type ThreadId,
} from '@workspace/contracts'
import { useCallback, useMemo, useState } from 'react'

import type { ChatEnvironment } from '../environment/chat-environment'
import {
  createDraftThreadSubmission,
  defaultChatModelSelection,
} from '../lib/chat-command-builders'
import {
  replayAfterDraftTurnDispatch,
  scheduleThreadProjectionSyncAfterDispatch,
} from '../lib/chat-command-sync'
import {
  chatCommandSummary,
  logChatPipelineInfo,
  logChatPipelineWarn,
  optimisticMessageSummary,
} from '../lib/chat-pipeline-logging'
import { useChatOptimisticStore } from '../state/chat-optimistic-store'
import { ChatInput, type ChatInputSubmitPayload } from './chat-input'
import { ChatWelcomeView } from './chat-welcome-view'

const DRAFT_CHAT_KEY = 'draft'

export function ChatDraftView({
  disabled,
  environment,
  onThreadCreated,
  project,
  rootPath,
}: {
  disabled: boolean
  environment: ChatEnvironment
  onThreadCreated: (threadId: ThreadId) => void
  project: OrchestrationProjectShell | null
  rootPath: string
}) {
  const [sendError, setSendError] = useState<string | null>(null)
  const modelSelection = useMemo(
    () => project?.defaultModelSelection ?? defaultChatModelSelection(),
    [project?.defaultModelSelection],
  )
  const handleStop = useCallback(() => undefined, [])
  const handleSend = useCallback(
    async ({
      attachments,
      interactionMode,
      modelSelection,
      runtimeMode,
      text,
    }: ChatInputSubmitPayload) => {
      if (!project) {
        setSendError('Workspace chat is still preparing.')
        return false
      }

      const submission = createDraftThreadSubmission({
        attachments,
        createdAt: new Date().toISOString(),
        interactionMode,
        modelSelection,
        projectId: project.id,
        rootPath,
        runtimeMode,
        text,
      })
      logChatPipelineInfo('chat.draft.submit', {
        attachmentCount: attachments.length,
        interactionMode,
        model: modelSelection.model,
        projectId: project.id,
        providerInstanceId: modelSelection.providerInstanceId,
        runtimeMode,
        textLength: text.length,
        threadId: submission.command.threadId,
      })
      const result = await dispatchDraftSubmission(environment, submission)
      if (!result.ok) {
        setSendError(result.error)
        return false
      }

      setSendError(null)
      onThreadCreated(submission.command.threadId)
      return true
    },
    [environment, onThreadCreated, project, rootPath],
  )

  return (
    <section className='flex min-h-0 flex-1 flex-col'>
      <ChatWelcomeView />
      <ChatInput
        busy={false}
        disabled={disabled || !project}
        draftKey={DRAFT_CHAT_KEY}
        error={sendError}
        interactionMode={DEFAULT_INTERACTION_MODE}
        modelSelection={modelSelection}
        rootPath={rootPath}
        runtimeMode={DEFAULT_RUNTIME_MODE}
        onStop={handleStop}
        onSubmit={handleSend}
      />
    </section>
  )
}

async function dispatchDraftSubmission(
  environment: ChatEnvironment,
  submission: ReturnType<typeof createDraftThreadSubmission>,
) {
  try {
    addOptimisticMessage(submission.command.commandId, submission.optimisticMessage)
    logChatPipelineInfo('chat.optimistic.added_from_draft_send', {
      ...optimisticMessageSummary({
        commandId: submission.command.commandId,
        messageId: submission.optimisticMessage.id,
        textLength: submission.optimisticMessage.text.length,
        threadId: submission.optimisticMessage.threadId,
      }),
    })
    logChatPipelineInfo('chat.draft.turn.dispatch.start', chatCommandSummary(submission.command))
    const turnResult = await environment.dispatchCommand(submission.command)
    logChatPipelineInfo('chat.draft.turn.dispatch.accepted', {
      ...chatCommandSummary(submission.command),
      deduped: turnResult.deduped,
      sequence: turnResult.sequence,
    })
    scheduleThreadProjectionSyncAfterDispatch({
      environment,
      replayAfterSequence: replayAfterDraftTurnDispatch(turnResult),
      threadId: submission.command.threadId,
    })
    return { ok: true as const }
  } catch (error) {
    removeOptimisticMessage(submission.optimisticMessage)
    logChatPipelineWarn('chat.draft.dispatch.failed', {
      error,
      threadId: submission.command.threadId,
      turnCommandId: submission.command.commandId,
    })
    return { error: chatDraftErrorMessage(error), ok: false as const }
  }
}

function addOptimisticMessage(commandId: CommandId, message: OrchestrationMessage) {
  useChatOptimisticStore.getState().addOptimisticMessage(commandId, message)
}

function removeOptimisticMessage(message: OrchestrationMessage) {
  useChatOptimisticStore.getState().removeOptimisticMessage(message.threadId, message.id)
}

function chatDraftErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message

  return 'Chat command failed.'
}
