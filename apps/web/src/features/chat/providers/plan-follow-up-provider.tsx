import type { ThreadId } from '@workspace/contracts'
import { useMemo, useState, type ReactNode } from 'react'

import type { ChatEnvironment } from '@/features/chat/environment/chat-environment'
import {
  createTurnSubmission,
  type SourceProposedPlanReference,
} from '@/features/chat/lib/chat-command-builders'
import {
  replayAfterTurnDispatch,
  scheduleThreadProjectionSyncAfterDispatch,
} from '@/features/chat/lib/chat-command-sync'
import { chatInputUploadAttachments } from '@/features/chat/lib/chat-input-attachments'
import {
  chatCommandSummary,
  createChatPipelineScope,
} from '@/features/chat/lib/chat-pipeline-logging'
import {
  actionableProposedPlan,
  resolvePlanFollowUpSubmission,
} from '@/features/chat/lib/chat-proposed-plan'
import { isChatThreadBusy } from '@/features/chat/lib/chat-thread-status'
import {
  ChatPlanFollowUpContext,
  type ChatPlanFollowUp,
} from '@/features/chat/providers/plan-follow-up-context'
import {
  useChatInputDraftStore,
  type ChatInputDraftTarget,
} from '@/features/chat/state/chat-input-draft-store'
import { useChatOptimisticStore } from '@/features/chat/state/chat-optimistic-store'
import { selectChatThreadById } from '@/features/chat/state/chat-projection-selectors'
import {
  useChatProjectionStore,
  type ChatThread,
} from '@/features/chat/state/chat-projection-store'

const NO_PLANS: ChatThread['proposedPlans'] = []

/**
 * Turns a finished plan into the next turn. Plan mode only pays off if the plan
 * can be acted on without retyping "go ahead", so this owns the single action
 * that closes that loop and stamps the turn with the plan it came from.
 *
 * It reads the composer draft rather than being handed it: the empty-draft rule
 * has to see the text as it stands at click time, and the banner must not become
 * a second owner of the composer's state.
 *
 * The environment arrives as a prop rather than being reached for, which keeps
 * the banner renderable against any `ChatEnvironment`, including the real
 * in-process one under test.
 */
export function ChatPlanFollowUpProvider({
  children,
  draftTarget,
  environment,
  threadId,
}: {
  readonly children: ReactNode
  readonly draftTarget: ChatInputDraftTarget
  readonly environment: ChatEnvironment
  readonly threadId: ThreadId
}) {
  const thread = useChatProjectionStore((state) => selectChatThreadById(state, threadId))
  const clearDraft = useChatInputDraftStore((state) => state.clearDraft)
  const [submitting, setSubmitting] = useState(false)
  // A running turn already owns the composer: the plan has been answered, and a
  // second Implement would start a duplicate build.
  const plan = isChatThreadBusy(thread)
    ? null
    : actionableProposedPlan(thread?.proposedPlans ?? NO_PLANS)
  // Context value identity: this wraps the composer, so a fresh object on every
  // keystroke would repaint the panels beside it for nothing.
  const value = useMemo<ChatPlanFollowUp>(
    () => ({
      plan,
      submitFollowUp: async () => {
        if (!plan || !thread || submitting) return false

        setSubmitting(true)
        try {
          return await dispatchPlanFollowUpTurn({
            clearDraft: () => clearDraft(draftTarget),
            draftTarget,
            environment,
            plan,
            thread,
          })
        } finally {
          setSubmitting(false)
        }
      },
      submitting,
    }),
    [clearDraft, draftTarget, environment, plan, submitting, thread],
  )

  return <ChatPlanFollowUpContext value={value}>{children}</ChatPlanFollowUpContext>
}

async function dispatchPlanFollowUpTurn({
  clearDraft,
  draftTarget,
  environment,
  plan,
  thread,
}: {
  clearDraft: () => void
  draftTarget: ChatInputDraftTarget
  environment: ChatEnvironment
  plan: NonNullable<ChatPlanFollowUp['plan']>
  thread: ChatThread
}): Promise<boolean> {
  // Read live: the draft as it stands at click time is what decides implement
  // versus refine, and a render-time copy would be one keystroke stale.
  const draft = useChatInputDraftStore.getState().getDraft(draftTarget)
  const followUp = resolvePlanFollowUpSubmission({
    draftText: draft.prompt,
    planMarkdown: plan.planMarkdown,
  })
  const sourceProposedPlan = followUp.implementsPlan ? planReference(plan) : undefined
  const submission = createTurnSubmission({
    attachments: chatInputUploadAttachments(draft.images),
    createdAt: new Date().toISOString(),
    interactionMode: followUp.interactionMode,
    modelSelection: draft.modelSelection ?? thread.modelSelection,
    runtimeMode: draft.runtimeMode ?? thread.runtimeMode,
    sourceProposedPlan,
    text: followUp.text,
    threadId: thread.id,
  })
  const startedAt = performance.now()
  const scope = createChatPipelineScope('chat.plan_follow_up.dispatch.summary', {
    ...chatCommandSummary(submission.command),
    implementsPlan: followUp.implementsPlan,
    planId: plan.id,
    planThreadId: plan.threadId,
    sourcePlanId: sourceProposedPlan?.planId ?? null,
  })

  useChatOptimisticStore
    .getState()
    .addOptimisticMessage(submission.command.commandId, submission.optimisticMessage)
  try {
    scope.increment('command.dispatchStartCount')
    const result = await environment.dispatchCommand(submission.command)
    scope.increment('command.dispatchAcceptedCount')
    scope.set({ deduped: result.deduped, outcome: 'ok', sequence: result.sequence })
    clearDraft()
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
    scope.warn('Plan follow-up dispatch failed.', { error })
    scope.set({ outcome: 'error' })
    return false
  } finally {
    scope.end({ durationMs: Math.round((performance.now() - startedAt) * 100) / 100 })
  }
}

function planReference(plan: NonNullable<ChatPlanFollowUp['plan']>): SourceProposedPlanReference {
  return { planId: plan.id, threadId: plan.threadId }
}
