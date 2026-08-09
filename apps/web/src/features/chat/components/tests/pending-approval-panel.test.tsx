import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { eventIdSchema, type ClientOrchestrationCommand, type ThreadId } from '@workspace/contracts'
import type { ReactNode } from 'react'
import * as v from 'valibot'

import { PendingApprovalPanel } from '@/features/chat/components/pending-approval-panel'
import { ChatPendingRequestsProvider } from '@/features/chat/providers/pending-requests-provider'
import { useChatProjectionStore } from '@/features/chat/state/chat-projection-store'
import { expect, test } from '../../../../../test/fixtures'
import { threadActivity, thread as threadFactory } from '../../../../../test/factories/chat'
import { renderWithProviders } from '../../../../../test/render'

const REQUEST_ID = 'approval-1'

test('an open approval renders its command and offers every decision', () => {
  renderPanel([requestedActivity()])

  expect(screen.getByRole('alert', { name: 'Pending approvals' })).toBeInTheDocument()
  expect(screen.getByLabelText('Command')).toHaveTextContent('rm -rf build')
  for (const label of ['Allow', 'Allow for this session', 'Deny', 'Cancel']) {
    expect(screen.getByRole('button', { name: label })).toBeEnabled()
  }
})

test('allowing dispatches the respond command for that request', async () => {
  const { dispatched } = renderPanel([requestedActivity()])

  await userEvent.click(screen.getByRole('button', { name: 'Allow' }))

  expect(dispatched).toHaveLength(1)
  expect(dispatched[0]).toMatchObject({
    decision: 'accept',
    requestId: REQUEST_ID,
    type: 'thread.approval.respond',
  })
})

test('each decision sends its own verb', async () => {
  const { dispatched } = renderPanel([requestedActivity()])

  await userEvent.click(screen.getByRole('button', { name: 'Deny' }))

  expect(dispatched[0]).toMatchObject({ decision: 'decline', type: 'thread.approval.respond' })
})

test('a resolved approval leaves nothing to answer', () => {
  renderPanel([requestedActivity(), resolvedActivity()])

  expect(screen.queryByRole('alert', { name: 'Pending approvals' })).not.toBeInTheDocument()
})

test('the decisions stay disabled while a response is in flight', async () => {
  // Never settles, so the row is observed mid-dispatch rather than after it.
  renderPanel([requestedActivity()], () => new Promise(() => {}))

  await userEvent.click(screen.getByRole('button', { name: 'Allow' }))

  expect(await screen.findByRole('button', { name: 'Allow' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Deny' })).toBeDisabled()
})

test('a failed dispatch re-enables the row so the agent can still be unblocked', async () => {
  renderPanel([requestedActivity()], () => Promise.reject(new Error('offline')))

  await userEvent.click(screen.getByRole('button', { name: 'Allow' }))

  expect(await screen.findByRole('button', { name: 'Allow' })).toBeEnabled()
})

function requestedActivity() {
  return threadActivity({
    payload: {
      detail: 'rm -rf build',
      requestId: REQUEST_ID,
      requestKind: 'command',
      requestType: 'exec_command_approval',
    },
  })
}

function resolvedActivity() {
  return threadActivity({
    id: v.parse(eventIdSchema, 'event-activity-2'),
    kind: 'approval.resolved',
    payload: { decision: 'accept', requestId: REQUEST_ID, requestKind: 'command' },
    sequence: 2,
    summary: 'Approval resolved',
  })
}

function renderPanel(
  activities: ReturnType<typeof threadActivity>[],
  dispatch?: () => Promise<{ deduped: boolean; sequence: number }>,
) {
  const seeded = threadFactory({ activities })
  useChatProjectionStore.getState().resetChatProjection()
  useChatProjectionStore.getState().syncThreadDetailSnapshot({
    checkpoints: [],
    proposedPlans: [],
    snapshotSequence: 1,
    // The store's ChatThread drops `deletedAt`; the wire snapshot still carries it.
    thread: { ...seeded, deletedAt: null },
  })

  const dispatched: ClientOrchestrationCommand[] = []
  const dispatchCommand = async (command: ClientOrchestrationCommand) => {
    dispatched.push(command)
    if (dispatch) return dispatch()

    return { deduped: false, sequence: 1 }
  }

  renderWithProviders(
    <Wrap dispatchCommand={dispatchCommand} threadId={seeded.id}>
      <PendingApprovalPanel />
    </Wrap>,
  )

  return { dispatched }
}

function Wrap({
  children,
  dispatchCommand,
  threadId,
}: {
  children: ReactNode
  dispatchCommand: (command: ClientOrchestrationCommand) => Promise<{
    deduped: boolean
    sequence: number
  }>
  threadId: ThreadId
}) {
  return (
    <ChatPendingRequestsProvider dispatchCommand={dispatchCommand} threadId={threadId}>
      {children}
    </ChatPendingRequestsProvider>
  )
}
