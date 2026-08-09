import type {
  ApprovalRequestId,
  OrchestrationThreadActivity,
  ThreadApprovalRespondCommand,
  ThreadId,
  ThreadUserInputRespondCommand,
} from '@workspace/contracts'
import { useMemo, useState, type ReactNode } from 'react'

import type { ChatEnvironment } from '@/features/chat/environment/chat-environment'
import {
  createApprovalRespondCommand,
  createUserInputRespondCommand,
} from '@/features/chat/lib/chat-command-builders'
import {
  chatCommandSummary,
  createChatPipelineScope,
} from '@/features/chat/lib/chat-pipeline-logging'
import {
  ChatPendingRequestsContext,
  type ChatPendingRequests,
} from '@/features/chat/providers/pending-requests-context'
import { selectChatThreadById } from '@/features/chat/state/chat-projection-selectors'
import { useChatProjectionStore } from '@/features/chat/state/chat-projection-store'
import { derivePendingApprovals } from '@/features/chat/utils/pending-approvals'
import { derivePendingUserInputs } from '@/features/chat/utils/pending-user-input'

type DispatchCommand = ChatEnvironment['dispatchCommand']
type RespondingRequestIds = ReadonlySet<ApprovalRequestId>
type SetResponding = (update: (current: RespondingRequestIds) => RespondingRequestIds) => void

const NO_ACTIVITIES: readonly OrchestrationThreadActivity[] = []
const NONE_RESPONDING: RespondingRequestIds = new Set()

/**
 * Owns the thread's blocking requests: it derives the open approvals and user
 * input prompts straight from the activity stream, so a request becomes
 * answerable the moment its activity lands, and it turns the two answers into
 * dispatched commands.
 *
 * The dispatch seam arrives as a prop rather than being reached for, which
 * keeps the panels renderable against any `ChatEnvironment` — including the
 * real in-process one under test.
 */
export function ChatPendingRequestsProvider({
  children,
  dispatchCommand,
  threadId,
}: {
  readonly children: ReactNode
  readonly dispatchCommand: DispatchCommand
  readonly threadId: ThreadId
}) {
  const activities = useChatProjectionStore(
    (state) => selectChatThreadById(state, threadId)?.activities ?? NO_ACTIVITIES,
  )
  const [responding, setResponding] = useState<RespondingRequestIds>(NONE_RESPONDING)
  // Context value identity: these panels sit beside the composer, so a fresh
  // object on every composer render would repaint them for nothing.
  const value = useMemo<ChatPendingRequests>(
    () => ({
      isResponding: (requestId) => responding.has(requestId),
      pendingApprovals: derivePendingApprovals(activities),
      pendingUserInputs: derivePendingUserInputs(activities),
      respondToApproval: (requestId, decision) =>
        dispatchPendingRequestResponse({
          command: createApprovalRespondCommand({
            decision,
            requestId,
            threadId,
          }),
          context: { decision },
          dispatchCommand,
          requestId,
          setResponding,
        }),
      respondToUserInput: (requestId, answers) =>
        dispatchPendingRequestResponse({
          command: createUserInputRespondCommand({
            answers,
            requestId,
            threadId,
          }),
          // Count only: an answer can be a credential the provider asked for.
          context: { answerCount: Object.keys(answers).length },
          dispatchCommand,
          requestId,
          setResponding,
        }),
    }),
    [activities, dispatchCommand, responding, threadId],
  )

  return <ChatPendingRequestsContext value={value}>{children}</ChatPendingRequestsContext>
}

async function dispatchPendingRequestResponse({
  command,
  context,
  dispatchCommand,
  requestId,
  setResponding,
}: {
  command: ThreadApprovalRespondCommand | ThreadUserInputRespondCommand
  context: Record<string, unknown>
  dispatchCommand: DispatchCommand
  requestId: ApprovalRequestId
  setResponding: SetResponding
}): Promise<boolean> {
  setResponding((current) => withRequestId(current, requestId))
  const startedAt = performance.now()
  const scope = createChatPipelineScope('chat.pending_request.respond.summary', {
    ...chatCommandSummary(command),
    ...context,
    requestId,
  })

  try {
    scope.increment('command.dispatchStartCount')
    const result = await dispatchCommand(command)
    scope.increment('command.dispatchAcceptedCount')
    scope.set({ deduped: result.deduped, outcome: 'ok', sequence: result.sequence })
    return true
  } catch (error) {
    // A dropped command leaves the agent blocked, so the row has to come back
    // enabled. A success stays disabled until the resolved activity drops it.
    setResponding((current) => withoutRequestId(current, requestId))
    scope.increment('command.dispatchFailedCount')
    scope.warn('Pending request response dispatch failed.', { error })
    scope.set({ outcome: 'error' })
    return false
  } finally {
    scope.end({ durationMs: Math.round((performance.now() - startedAt) * 100) / 100 })
  }
}

function withRequestId(current: RespondingRequestIds, requestId: ApprovalRequestId) {
  const next = new Set(current)
  next.add(requestId)

  return next
}

function withoutRequestId(current: RespondingRequestIds, requestId: ApprovalRequestId) {
  if (!current.has(requestId)) return current

  const next = new Set(current)
  next.delete(requestId)

  return next
}
