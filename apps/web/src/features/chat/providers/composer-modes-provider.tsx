import type {
  ThreadId,
  ThreadInteractionModeSetCommand,
  ThreadRuntimeModeSetCommand,
} from '@workspace/contracts'
import { useMemo, type ReactNode } from 'react'

import type { ChatEnvironment } from '@/features/chat/environment/chat-environment'
import {
  createInteractionModeSetCommand,
  createRuntimeModeSetCommand,
} from '@/features/chat/lib/chat-command-builders'
import {
  chatCommandSummary,
  createChatPipelineScope,
} from '@/features/chat/lib/chat-pipeline-logging'
import {
  ChatComposerModesContext,
  type ChatComposerModes,
} from '@/features/chat/providers/composer-modes-context'
import {
  useChatInputDraftStore,
  type ChatInputDraftTarget,
} from '@/features/chat/state/chat-input-draft-store'

type DispatchCommand = ChatEnvironment['dispatchCommand']
type ModeSetCommand = ThreadInteractionModeSetCommand | ThreadRuntimeModeSetCommand

/**
 * Owns the composer's access and plan/build picks for one thread. A pick is two
 * facts at once: the draft override the next turn carries, and the thread's own
 * mode — without the second one the thread projection keeps reporting whatever
 * it was created with, so the sidebar and any other client read the wrong mode.
 *
 * The dispatch seam arrives as a prop rather than being reached for, which keeps
 * the menu renderable against any `ChatEnvironment`, including the real
 * in-process one under test.
 *
 * `threadId` is null on the draft composer, where there is no thread to set a
 * mode on yet. The pick still lands in the draft, and the turn that creates the
 * thread carries it through `bootstrap.createThread`.
 */
export function ChatComposerModesProvider({
  children,
  dispatchCommand,
  draftTarget,
  threadId,
}: {
  readonly children: ReactNode
  readonly dispatchCommand: DispatchCommand
  readonly draftTarget: ChatInputDraftTarget
  readonly threadId: ThreadId | null
}) {
  const setInteractionMode = useChatInputDraftStore((state) => state.setInteractionMode)
  const setRuntimeMode = useChatInputDraftStore((state) => state.setRuntimeMode)
  // Context value identity: this wraps the whole composer subtree, so a fresh
  // object every render would repaint the panels and the input beside the menu.
  const value = useMemo<ChatComposerModes>(
    () => ({
      selectInteractionMode: async (interactionMode) => {
        // Local first: the pick has to survive an offline or rejected dispatch,
        // because the turn command is what actually carries it to the provider.
        setInteractionMode(draftTarget, interactionMode)
        if (!threadId) return true

        return dispatchModeSet({
          command: createInteractionModeSetCommand({
            interactionMode,
            threadId,
          }),
          context: { interactionMode },
          dispatchCommand,
        })
      },
      selectRuntimeMode: async (runtimeMode) => {
        setRuntimeMode(draftTarget, runtimeMode)
        if (!threadId) return true

        return dispatchModeSet({
          command: createRuntimeModeSetCommand({
            runtimeMode,
            threadId,
          }),
          context: { runtimeMode },
          dispatchCommand,
        })
      },
    }),
    [dispatchCommand, draftTarget, setInteractionMode, setRuntimeMode, threadId],
  )

  return <ChatComposerModesContext value={value}>{children}</ChatComposerModesContext>
}

async function dispatchModeSet({
  command,
  context,
  dispatchCommand,
}: {
  command: ModeSetCommand
  context: Record<string, unknown>
  dispatchCommand: DispatchCommand
}): Promise<boolean> {
  const startedAt = performance.now()
  const scope = createChatPipelineScope('chat.thread_mode.set.summary', {
    ...chatCommandSummary(command),
    ...context,
  })

  try {
    scope.increment('command.dispatchStartCount')
    const result = await dispatchCommand(command)
    scope.increment('command.dispatchAcceptedCount')
    scope.set({ deduped: result.deduped, outcome: 'ok', sequence: result.sequence })
    return true
  } catch (error) {
    // Nothing is rolled back: the draft override keeps the next turn correct
    // even when the thread-level sync never lands.
    scope.increment('command.dispatchFailedCount')
    scope.warn('Thread mode set dispatch failed.', { error })
    scope.set({ outcome: 'error' })
    return false
  } finally {
    scope.end({ durationMs: Math.round((performance.now() - startedAt) * 100) / 100 })
  }
}
