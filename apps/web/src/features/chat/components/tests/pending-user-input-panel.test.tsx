import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { eventIdSchema, type ClientOrchestrationCommand } from '@workspace/contracts'
import * as v from 'valibot'

import { PendingUserInputPanel } from '@/features/chat/components/pending-user-input-panel'
import { ChatPendingRequestsProvider } from '@/features/chat/providers/pending-requests-provider'
import { useChatProjectionStore } from '@/features/chat/state/chat-projection-store'
import { expect, test } from '../../../../../test/fixtures'
import { threadActivity, thread as threadFactory } from '../../../../../test/factories/chat'
import { renderWithProviders } from '../../../../../test/render'

const REQUEST_ID = 'user-input-1'

test('a single-select question renders its options and submits the chosen value', async () => {
  const { dispatched } = renderPanel([requestedActivity([framework()])])

  expect(screen.getByRole('alert', { name: 'Agent question' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /Vitest/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Submit' }))

  expect(dispatched[0]).toMatchObject({
    answers: { framework: 'vitest' },
    requestId: REQUEST_ID,
    type: 'thread.user-input.respond',
  })
})

test('submit stays disabled until every question is answered', async () => {
  renderPanel([requestedActivity([framework(), notes()])])

  expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled()

  await userEvent.click(screen.getByRole('button', { name: /Vitest/ }))
  await userEvent.type(screen.getByLabelText('Your answer'), 'cover the revert path')

  expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled()
})

test('a multi-question prompt walks both answers into one response', async () => {
  const { dispatched } = renderPanel([requestedActivity([framework(), notes()])])

  expect(screen.getByText('1/2')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /Vitest/ }))
  await userEvent.type(screen.getByLabelText('Your answer'), 'cover the revert path')
  await userEvent.click(screen.getByRole('button', { name: 'Submit' }))

  expect(dispatched[0]).toMatchObject({
    answers: { framework: 'vitest', notes: 'cover the revert path' },
    type: 'thread.user-input.respond',
  })
})

test('a multi-select keeps collecting values instead of advancing', async () => {
  const { dispatched } = renderPanel([requestedActivity([targets()])])

  await userEvent.click(screen.getByRole('button', { name: /Server/ }))
  await userEvent.click(screen.getByRole('button', { name: /Web/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Submit' }))

  expect(dispatched[0]).toMatchObject({ answers: { targets: ['server', 'web'] } })
})

test('a resolved prompt leaves nothing to answer', () => {
  renderPanel([requestedActivity([framework()]), resolvedActivity()])

  expect(screen.queryByRole('alert', { name: 'Agent question' })).not.toBeInTheDocument()
})

function framework() {
  return {
    answerKind: 'single-select',
    id: 'framework',
    options: [
      { label: 'Vitest', value: 'vitest' },
      { label: 'Bun test', value: 'bun-test' },
    ],
    prompt: 'Which test runner should this use?',
  }
}

function targets() {
  return {
    answerKind: 'multi-select',
    id: 'targets',
    options: [
      { label: 'Server', value: 'server' },
      { label: 'Web', value: 'web' },
    ],
    prompt: 'Which targets should this cover?',
  }
}

function notes() {
  return { answerKind: 'text', id: 'notes', prompt: 'Anything else the agent should know?' }
}

function requestedActivity(questions: readonly unknown[]) {
  return threadActivity({
    kind: 'user-input.requested',
    payload: { questions, requestId: REQUEST_ID },
    summary: 'User input requested',
    tone: 'info',
  })
}

function resolvedActivity() {
  return threadActivity({
    id: v.parse(eventIdSchema, 'event-activity-2'),
    kind: 'user-input.resolved',
    payload: { answers: { framework: 'vitest' }, requestId: REQUEST_ID },
    sequence: 2,
    summary: 'User input submitted',
    tone: 'info',
  })
}

function renderPanel(activities: ReturnType<typeof threadActivity>[]) {
  const seeded = threadFactory({ activities })
  useChatProjectionStore.getState().resetChatProjection()
  useChatProjectionStore
    .getState()
    // The store's ChatThread drops `deletedAt`; the wire snapshot still carries it.
    .syncThreadDetailSnapshot({
      checkpoints: [],
      proposedPlans: [],
      snapshotSequence: 1,
      thread: { ...seeded, deletedAt: null },
    })

  const dispatched: ClientOrchestrationCommand[] = []

  renderWithProviders(
    <ChatPendingRequestsProvider
      dispatchCommand={async (command) => {
        dispatched.push(command)
        return { deduped: false, sequence: 1 }
      }}
      threadId={seeded.id}
    >
      <PendingUserInputPanel />
    </ChatPendingRequestsProvider>,
  )

  return { dispatched }
}
