import type {
  OrchestrationMessage,
  OrchestrationProposedPlan,
  ThreadId,
  ThreadTurnStartCommand,
} from '@workspace/contracts'
import { useMemo, useState, type ReactNode } from 'react'

import type { ChatTransport } from '@/features/chat/transport/chat-transport'
import {
  createDraftThreadSubmission,
  createTurnSubmission,
  type SourceProposedPlanReference,
} from '@/features/chat/utils/command-builders'
import { dispatchChatCommand, replayAfterDispatch } from '@/features/chat/utils/command-dispatch'
import { scheduleThreadProjectionSyncAfterDispatch } from '@/features/chat/utils/command-sync'
import { chatInputUploadAttachments } from '@/features/chat/utils/input-attachments'
import {
  actionableProposedPlan,
  planImplementationPrompt,
  planImplementationThreadTitle,
  resolvePlanFollowUpSubmission,
} from '@/features/chat/utils/proposed-plan'
import { isChatThreadBusy } from '@/features/chat/utils/thread-busy'
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

type PlanDispatchContext = {
  draftTarget: ChatInputDraftTarget
  transport: ChatTransport
  onThreadCreated: (threadId: ThreadId) => void
  plan: OrchestrationProposedPlan
  thread: ChatThread
}

/**
 * Turns a finished plan into the next turn. Plan mode only pays off if the plan
 * can be acted on without retyping "go ahead", so this owns the two actions that
 * close that loop — build it here, or build it in a thread of its own — and
 * stamps whichever turn results with the plan it came from.
 *
 * It reads the composer draft rather than being handed it: the empty-draft rule
 * has to see the text as it stands at click time, and the banner must not become
 * a second owner of the composer's state.
 *
 * The transport arrives as a prop rather than being reached for, which keeps
 * the banner renderable against any `ChatTransport`, including the real
 * in-process one under test.
 */
export function ChatPlanFollowUpProvider({
  children,
  draftTarget,
  transport,
  onThreadCreated,
  threadId,
}: {
  readonly children: ReactNode
  readonly draftTarget: ChatInputDraftTarget
  readonly transport: ChatTransport
  /**
   * Puts a newly split-off implementation thread on screen. A callback rather
   * than a reach into the session store: the two chat surfaces keep their
   * selection in different places, and only the host knows which it is.
   */
  readonly onThreadCreated: (threadId: ThreadId) => void
  readonly threadId: ThreadId
}) {
  const thread = useChatProjectionStore((state) => selectChatThreadById(state, threadId))
  const [submitting, setSubmitting] = useState(false)
  // A running turn already owns the composer: the plan has been answered, and a
  // second Implement would start a duplicate build.
  const plan = isChatThreadBusy(thread)
    ? null
    : actionableProposedPlan(thread?.proposedPlans ?? NO_PLANS)
  // Context value identity: this wraps the composer, so a fresh object on every
  // keystroke would repaint the panels beside it for nothing.
  const value = useMemo<ChatPlanFollowUp>(() => {
    // One follow-up in flight at a time whichever button started it: both end in
    // a turn against the same plan, and only one of them can be its implementation.
    const once = (dispatch: (context: PlanDispatchContext) => Promise<boolean>) => async () => {
      if (!plan || !thread || submitting) return false

      setSubmitting(true)
      try {
        return await dispatch({ draftTarget, transport, onThreadCreated, plan, thread })
      } finally {
        setSubmitting(false)
      }
    }

    return {
      implementInNewThread: once(dispatchPlanImplementationThread),
      plan,
      submitFollowUp: once(dispatchPlanFollowUpTurn),
      submitting,
    }
  }, [draftTarget, transport, onThreadCreated, plan, submitting, thread])

  return <ChatPlanFollowUpContext value={value}>{children}</ChatPlanFollowUpContext>
}

async function dispatchPlanFollowUpTurn({
  draftTarget,
  transport,
  plan,
  thread,
}: PlanDispatchContext): Promise<boolean> {
  const drafts = useChatInputDraftStore.getState()
  // Read live: the draft as it stands at click time is what decides implement
  // versus refine, and a render-time copy would be one keystroke stale.
  const draft = drafts.getDraft(draftTarget)
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
    // This path builds its own turn from the draft and then clears it, so
    // anything staged that it forgets is destroyed rather than deferred.
    terminalContexts: draft.terminalContexts,
    text: followUp.text,
    threadId: thread.id,
  })

  return dispatchPlanTurn({
    action: 'chat.plan_follow_up.dispatch.summary',
    command: submission.command,
    context: {
      implementsPlan: followUp.implementsPlan,
      planId: plan.id,
      planThreadId: plan.threadId,
      sourcePlanId: sourceProposedPlan?.planId ?? null,
      terminalContextCount: draft.terminalContexts.length,
    },
    transport,
    onAccepted: () => drafts.clearDraft(draftTarget),
    optimisticMessage: submission.optimisticMessage,
    planThreadId: plan.threadId,
  })
}

/**
 * Splits the build off into its own conversation. The plan is the whole first
 * turn, so nothing staged in the composer travels with it — that draft belongs
 * to the thread the user is leaving open, and destroying it to send a plan the
 * user never typed would be a trade they did not ask for.
 */
async function dispatchPlanImplementationThread({
  draftTarget,
  transport,
  onThreadCreated,
  plan,
  thread,
}: PlanDispatchContext): Promise<boolean> {
  const draft = useChatInputDraftStore.getState().getDraft(draftTarget)
  const submission = createDraftThreadSubmission({
    createdAt: new Date().toISOString(),
    // The composer's live pick, same as the in-thread path: switching model and
    // then splitting the build off should still run on the model that was picked.
    modelSelection: draft.modelSelection ?? thread.modelSelection,
    projectId: thread.projectId,
    // The plan was written against this checkout, so a worktree session hands
    // its implementation to the same worktree rather than back to the project root.
    rootPath: thread.worktreePath ?? draftTarget.rootPath,
    runtimeMode: draft.runtimeMode ?? thread.runtimeMode,
    // Stamped on the command the server sees, so the plan is marked implemented
    // by the turn that implements it rather than by a second round trip.
    sourceProposedPlan: { planId: plan.id, threadId: plan.threadId },
    text: planImplementationPrompt(plan.planMarkdown),
    // The prompt's first line is the instruction carrying the plan, not the
    // plan, so the thread would otherwise be named "Please implement this plan".
    title: planImplementationThreadTitle(plan.planMarkdown),
  })
  const command = submission.command

  return dispatchPlanTurn({
    action: 'chat.plan_implementation_thread.dispatch.summary',
    command,
    context: {
      planId: plan.id,
      planThreadId: plan.threadId,
      sourceThreadId: thread.id,
    },
    transport,
    // Only once the command is accepted: a rejected dispatch created no thread,
    // and the stage would sit on one that never arrives.
    onAccepted: () => onThreadCreated(command.threadId),
    optimisticMessage: submission.optimisticMessage,
    planThreadId: plan.threadId,
  })
}

async function dispatchPlanTurn({
  action,
  command,
  context,
  transport,
  onAccepted,
  optimisticMessage,
  planThreadId,
}: {
  action: string
  command: ThreadTurnStartCommand
  context: Record<string, unknown>
  transport: ChatTransport
  onAccepted: () => void
  optimisticMessage: OrchestrationMessage
  /** The thread the plan lives on, which is not always the one running the turn. */
  planThreadId: ThreadId
}): Promise<boolean> {
  const outcome = await dispatchChatCommand({
    action,
    beforeDispatch: () =>
      useChatOptimisticStore.getState().addOptimisticMessage(command.commandId, optimisticMessage),
    command,
    context: { ...context, planThreadResynced: planThreadId !== command.threadId },
    dispatchCommand: transport.dispatchCommand,
    onAccepted: (result) => {
      syncThreadsAfterPlanTurn({
        transport,
        planThreadId,
        replayAfterSequence: replayAfterDispatch(command, result),
        turnThreadId: command.threadId,
      })
      onAccepted()
    },
    // Only the dispatch is guarded here. Anything after it runs on a command the
    // server accepted, and rolling the message back then would erase a turn that
    // is already running.
    onFailed: () =>
      useChatOptimisticStore
        .getState()
        .removeOptimisticMessage(optimisticMessage.threadId, optimisticMessage.id),
  })

  return outcome.ok
}

/**
 * The turn thread converges on its own — its events carry the new turn. The plan's
 * thread does not: the server stamps `implementedAt` across threads while projecting
 * the turn start, and that write appends nothing to the plan thread's aggregate, so
 * its detail stream (filtered by thread) will never mention it. Without a resnapshot
 * here the source thread keeps offering to implement a plan that is already building.
 */
function syncThreadsAfterPlanTurn({
  transport,
  planThreadId,
  replayAfterSequence,
  turnThreadId,
}: {
  transport: ChatTransport
  planThreadId: ThreadId
  replayAfterSequence: number
  turnThreadId: ThreadId
}) {
  scheduleThreadProjectionSyncAfterDispatch({
    transport,
    replayAfterSequence,
    threadId: turnThreadId,
  })
  if (planThreadId === turnThreadId) return

  // The plan's thread ran no turn of its own, so there is no tail to replay past
  // what it already holds; the snapshot half of the sync is what carries the stamp.
  const planThreadSequence =
    useChatProjectionStore.getState().threadDetailSequenceById[planThreadId] ?? 0

  scheduleThreadProjectionSyncAfterDispatch({
    transport,
    replayAfterSequence: planThreadSequence,
    threadId: planThreadId,
  })
}

function planReference(plan: OrchestrationProposedPlan): SourceProposedPlanReference {
  return { planId: plan.id, threadId: plan.threadId }
}
