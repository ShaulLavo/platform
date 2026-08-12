import {
  DEFAULT_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  type CommandId,
  type ModelSelection,
  type OrchestrationMessage,
  type OrchestrationProjectShell,
  type ThreadId,
} from '@workspace/contracts'
import { useQuery } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'

import { errorMessage } from '@/lib/error-message'
import type { ChatEnvironment } from '../environment/chat-environment'
import { useSessionIsolationStore } from '@/features/chat-mode/state/session-isolation-store'
import {
  createDraftThreadSubmission,
  createProjectDefaultModelCommand,
} from '../lib/chat-command-builders'
import { providerListQueryOptions } from '../lib/provider-query'
import { resolveChatModelSelection } from '../lib/resolve-model-selection'
import {
  replayAfterDraftTurnDispatch,
  scheduleThreadProjectionSyncAfterDispatch,
} from '../lib/chat-command-sync'
import {
  chatCommandSummary,
  createChatPipelineScope,
  type ChatPipelineScope,
  optimisticMessageSummary,
} from '../lib/chat-pipeline-logging'
import { ChatComposerModesProvider } from '../providers/composer-modes-provider'
import { useChatOptimisticStore } from '../state/chat-optimistic-store'
import type { ChatInputDraftTarget } from '../state/chat-input-draft-store'
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
  // The same target ChatInput builds for itself, so a mode pick lands on the
  // draft the send path reads. Stable identity: it feeds the modes context value.
  const draftTarget = useMemo<ChatInputDraftTarget>(
    () => ({ draftKey: DRAFT_CHAT_KEY, rootPath }),
    [rootPath],
  )
  const providersQuery = useQuery(providerListQueryOptions())
  const modelSelection = resolveChatModelSelection(
    providersQuery.data?.providers,
    project?.defaultModelSelection ?? null,
  )
  const consumeIsolation = useSessionIsolationStore((state) => state.consumeIsolation)
  const handleStop = useCallback(() => undefined, [])
  const handlePersistModelSelection = useCallback(
    (next: ModelSelection) => {
      if (!project) return

      void environment.dispatchCommand(
        createProjectDefaultModelCommand({
          defaultModelSelection: next,
          projectId: project.id,
        }),
      )
    },
    [environment, project],
  )
  const handleSend = useCallback(
    async ({
      attachments,
      interactionMode,
      modelSelection,
      runtimeMode,
      terminalContexts,
      text,
    }: ChatInputSubmitPayload) => {
      if (!project) {
        setSendError('Workspace chat is still preparing.')
        return false
      }

      // Declared, not created. The server makes the worktree while the turn is
      // held at the gate, so a client that dies here cannot orphan a directory
      // no thread owns.
      const requestWorktree = consumeIsolation()
      const submission = createDraftThreadSubmission({
        attachments,
        createdAt: new Date().toISOString(),
        interactionMode,
        modelSelection,
        projectId: project.id,
        rootPath,
        runtimeMode,
        terminalContexts,
        text,
        ...(requestWorktree ? { requestWorktree } : {}),
      })
      const scope = createChatPipelineScope('chat.draft.dispatch.summary', {
        ...chatCommandSummary(submission.command),
        attachmentCount: attachments.length,
        interactionMode,
        model: modelSelection.model,
        projectId: project.id,
        providerInstanceId: modelSelection.providerInstanceId,
        runtimeMode,
        terminalContextCount: terminalContexts.length,
        textLength: text.length,
      })
      const startedAt = performance.now()

      try {
        scope.increment('command.submitCount')
        const result = await dispatchDraftSubmission(environment, submission, scope)
        if (!result.ok) {
          setSendError(result.error)
          return false
        }

        setSendError(null)
        onThreadCreated(submission.command.threadId)
        return true
      } finally {
        scope.end({ durationMs: elapsedMs(startedAt) })
      }
    },
    [consumeIsolation, environment, onThreadCreated, project, rootPath],
  )

  return (
    <section className='flex min-h-0 flex-1 flex-col'>
      <ChatWelcomeView />
      {/* No thread exists yet, so a mode pick only lands in the draft — the turn
          that creates the thread carries it through `bootstrap.createThread`. */}
      <ChatComposerModesProvider
        dispatchCommand={environment.dispatchCommand}
        draftTarget={draftTarget}
        threadId={null}
      >
        <ChatInput
          busy={false}
          disabled={disabled || !project}
          draftKey={DRAFT_CHAT_KEY}
          error={sendError}
          interactionMode={DEFAULT_INTERACTION_MODE}
          modelSelection={modelSelection}
          rootPath={rootPath}
          runtimeMode={DEFAULT_RUNTIME_MODE}
          onPersistModelSelection={handlePersistModelSelection}
          onStop={handleStop}
          onSubmit={handleSend}
        />
      </ChatComposerModesProvider>
    </section>
  )
}

async function dispatchDraftSubmission(
  environment: ChatEnvironment,
  submission: ReturnType<typeof createDraftThreadSubmission>,
  scope: ChatPipelineScope,
) {
  try {
    addOptimisticMessage(submission.command.commandId, submission.optimisticMessage)
    scope.increment('command.optimisticAddedCount')
    scope.set({
      optimistic: optimisticMessageSummary({
        commandId: submission.command.commandId,
        messageId: submission.optimisticMessage.id,
        textLength: submission.optimisticMessage.text.length,
        threadId: submission.optimisticMessage.threadId,
      }),
    })
    scope.increment('command.dispatchStartCount')
    const turnResult = await environment.dispatchCommand(submission.command)
    scope.increment('command.dispatchAcceptedCount')
    scope.set({
      deduped: turnResult.deduped,
      outcome: 'ok',
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
    scope.increment('command.dispatchFailedCount')
    scope.warn('Draft command dispatch failed.', { error })
    scope.set({ outcome: 'error' })
    return { error: errorMessage(error, 'Chat command failed.'), ok: false as const }
  }
}

function addOptimisticMessage(commandId: CommandId, message: OrchestrationMessage) {
  useChatOptimisticStore.getState().addOptimisticMessage(commandId, message)
}

function removeOptimisticMessage(message: OrchestrationMessage) {
  useChatOptimisticStore.getState().removeOptimisticMessage(message.threadId, message.id)
}

function elapsedMs(startedAt: number) {
  return Math.round((performance.now() - startedAt) * 100) / 100
}
