import {
  type CommandId,
  type ModelSelection,
  type OrchestrationMessage,
  type OrchestrationProjectShell,
  type ThreadId,
} from '@workspace/contracts'
import { useQuery } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'

import { notifyChatCommandError } from '@/features/chat/notify-command-error'
import type { ChatEnvironment } from '../environment/chat-environment'
import { useSessionIsolationStore } from '@/features/chat-mode/state/session-isolation-store'
import {
  createDraftThreadSubmission,
  createProjectDefaultModelCommand,
} from '../lib/chat-command-builders'
import { providerListQueryOptions } from '../lib/provider-query'
import { resolveChatModelSelection } from '../lib/resolve-model-selection'
import { dispatchChatCommand, replayAfterDispatch } from '../lib/chat-command-dispatch'
import { scheduleThreadProjectionSyncAfterDispatch } from '../lib/chat-command-sync'
import { optimisticMessageSummary } from '../lib/chat-pipeline-logging'
import { ChatComposerModesProvider } from '../providers/composer-modes-provider'
import { useChatOptimisticStore } from '../state/chat-optimistic-store'
import type { ChatInputDraftTarget } from '../state/chat-input-draft-store'
import { ChatInput, type ChatInputSubmitPayload } from './chat-input'
import { ChatWelcomeView } from './chat-welcome-view'
import { useSettingValue } from '@/features/settings/hooks/use-setting-value'

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
  // The user's chosen posture for a new session. The server keeps its own
  // `?? DEFAULT_RUNTIME_MODE` fallbacks as the untrusted-input floor; this is
  // only the seed the composer starts from.
  const defaultRuntimeMode = useSettingValue('chat.defaultRuntimeMode')
  const defaultInteractionMode = useSettingValue('chat.defaultInteractionMode')
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

      void dispatchChatCommand({
        action: 'chat.project.default_model.set',
        command: createProjectDefaultModelCommand({
          defaultModelSelection: next,
          projectId: project.id,
        }),
        dispatchCommand: environment.dispatchCommand,
        onFailed: (error) => notifyChatCommandError(error, 'Could not save the default model'),
      })
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
      const outcome = await dispatchChatCommand({
        action: 'chat.draft.dispatch.summary',
        beforeDispatch: (scope) => {
          scope.increment('command.submitCount')
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
        },
        command: submission.command,
        context: {
          attachmentCount: attachments.length,
          interactionMode,
          model: modelSelection.model,
          projectId: project.id,
          providerInstanceId: modelSelection.providerInstanceId,
          runtimeMode,
          terminalContextCount: terminalContexts.length,
          textLength: text.length,
        },
        dispatchCommand: environment.dispatchCommand,
        onAccepted: (result) =>
          scheduleThreadProjectionSyncAfterDispatch({
            environment,
            replayAfterSequence: replayAfterDispatch(submission.command, result),
            threadId: submission.command.threadId,
          }),
        onFailed: () => removeOptimisticMessage(submission.optimisticMessage),
      })
      if (!outcome.ok) {
        setSendError(outcome.message)
        return false
      }

      setSendError(null)
      onThreadCreated(submission.command.threadId)

      return true
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
          interactionMode={defaultInteractionMode}
          modelSelection={modelSelection}
          rootPath={rootPath}
          runtimeMode={defaultRuntimeMode}
          onPersistModelSelection={handlePersistModelSelection}
          onStop={handleStop}
          onSubmit={handleSend}
        />
      </ChatComposerModesProvider>
    </section>
  )
}

function addOptimisticMessage(commandId: CommandId, message: OrchestrationMessage) {
  useChatOptimisticStore.getState().addOptimisticMessage(commandId, message)
}

function removeOptimisticMessage(message: OrchestrationMessage) {
  useChatOptimisticStore.getState().removeOptimisticMessage(message.threadId, message.id)
}
