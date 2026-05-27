import type {
  CommandId,
  OrchestrationMessage,
  OrchestrationProjectShell,
  ThreadId,
} from '@workspace/contracts'
import { useCallback, useMemo, useState } from 'react'

import type { ChatEnvironment } from '../environment/chat-environment'
import {
  createDraftThreadSubmission,
  createThreadDeleteCommand,
  defaultChatModelSelection,
} from '../lib/chat-command-builders'
import { formatChatModelLabel } from '../lib/chat-formatters'
import { useChatOptimisticStore } from '../state/chat-optimistic-store'
import { ChatInput } from './chat-input'
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
    async (text: string) => {
      if (!project) {
        setSendError('Workspace chat is still preparing.')
        return false
      }

      const submission = createDraftThreadSubmission({
        createdAt: new Date().toISOString(),
        modelSelection,
        projectId: project.id,
        rootPath,
        text,
      })
      const result = await dispatchDraftSubmission(environment, submission)
      if (!result.ok) {
        setSendError(result.error)
        return false
      }

      setSendError(null)
      onThreadCreated(submission.threadCommand.threadId)
      return true
    },
    [environment, modelSelection, onThreadCreated, project, rootPath],
  )

  return (
    <section className='flex min-h-0 flex-1 flex-col'>
      <ChatWelcomeView />
      <ChatInput
        busy={false}
        disabled={disabled || !project}
        draftKey={DRAFT_CHAT_KEY}
        error={sendError}
        modelLabel={formatChatModelLabel(modelSelection)}
        rootPath={rootPath}
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
  let threadCreated = false

  try {
    await environment.dispatchCommand(submission.threadCommand)
    threadCreated = true
    addOptimisticMessage(submission.turnCommand.commandId, submission.optimisticMessage)
    await environment.dispatchCommand(submission.turnCommand)
    return { ok: true as const }
  } catch (error) {
    removeOptimisticMessage(submission.optimisticMessage)
    await cleanupCreatedThread(environment, submission.threadCommand.threadId, threadCreated)
    return { error: chatDraftErrorMessage(error), ok: false as const }
  }
}

function addOptimisticMessage(commandId: CommandId, message: OrchestrationMessage) {
  useChatOptimisticStore.getState().addOptimisticMessage(commandId, message)
}

function removeOptimisticMessage(message: OrchestrationMessage) {
  useChatOptimisticStore.getState().removeOptimisticMessage(message.threadId, message.id)
}

async function cleanupCreatedThread(
  environment: ChatEnvironment,
  threadId: ThreadId,
  threadCreated: boolean,
) {
  if (!threadCreated) return

  try {
    await environment.dispatchCommand(
      createThreadDeleteCommand({
        deletedAt: new Date().toISOString(),
        threadId,
      }),
    )
  } catch {
    // Best-effort cleanup; preserve the original send error for the input.
  }
}

function chatDraftErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message

  return 'Chat command failed.'
}
