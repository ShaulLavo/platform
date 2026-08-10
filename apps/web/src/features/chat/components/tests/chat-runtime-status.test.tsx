import { QueryClient } from '@tanstack/react-query'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ChatRuntimeStatus } from '@/features/chat/components/chat-runtime-status'
import type { ChatCommandState } from '@/features/chat/lib/chat-runtime-state'
import { providerListQueryOptions } from '@/features/chat/lib/provider-query'
import { ChatProviderSignInProvider } from '@/features/chat/providers/provider-sign-in-provider'
import type { ChatThread } from '@/features/chat/state/chat-projection-store'
import { providerSnapshot, thread } from '../../../../../test/factories/chat'
import { expect, test } from '../../../../../test/fixtures'
import { renderWithProviders } from '../../../../../test/render'

const idleCommandState: ChatCommandState = {
  commandFailure: null,
  interruptPending: false,
  sendPending: false,
  stopPending: false,
}

test('the notice that needs an answer fronts the stack, whatever order it was produced in', async () => {
  // The spinner is produced first and matters least: a flat list put it on top
  // and pushed the approval — and the composer — down the viewport.
  renderStatus({ commandState: { ...idleCommandState, sendPending: true } })

  const alerts = await screen.findAllByRole('alert')
  expect(alerts).toHaveLength(1)
  expect(alerts[0]).toHaveTextContent('Approval requested')
  expect(screen.getByRole('button', { name: /Show 1 more notice/ })).toBeVisible()
})

test('the folded notices are still reachable', async () => {
  renderStatus({ commandState: { ...idleCommandState, sendPending: true } })

  await userEvent.click(screen.getByRole('button', { name: /Show 1 more notice/ }))

  const alerts = await screen.findAllByRole('alert')
  expect(alerts.map((alert) => alert.textContent)).toEqual([
    expect.stringContaining('Approval requested'),
    expect.stringContaining('Sending message'),
  ])
})

test('a dismissed failure stays dismissed while nothing about it has changed', async () => {
  const { rerender } = renderStatus({
    commandState: { ...idleCommandState, commandFailure: 'Dispatch rejected' },
    thread: thread({ pendingApprovalCount: 0 }),
  })

  await userEvent.click(await screen.findByRole('button', { name: 'Dismiss Command failed' }))
  expect(screen.queryByText('Dispatch rejected')).toBeNull()

  // The same failure re-rendered is the same failure: nothing has happened that
  // the user has not already read and put away.
  rerender('Dispatch rejected')
  expect(screen.queryByText('Dispatch rejected')).toBeNull()

  // A different failure is news, and comes back on its own.
  rerender('Worktree is locked')
  expect(await screen.findByText('Worktree is locked')).toBeVisible()
})

test('a request the thread is parked on cannot be dismissed', async () => {
  renderStatus()

  await screen.findByText('Approval requested')
  expect(screen.queryByRole('button', { name: /Dismiss/ })).toBeNull()
})

function renderStatus({
  commandState = idleCommandState,
  thread: chatThread = thread({ pendingApprovalCount: 1 }),
}: {
  commandState?: ChatCommandState
  thread?: ChatThread
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Number.POSITIVE_INFINITY, retry: false } },
  })
  queryClient.setQueryData(providerListQueryOptions().queryKey, {
    providers: [providerSnapshot()],
  })

  function statusTree(commandFailure: string | null) {
    return (
      <ChatProviderSignInProvider>
        <ChatRuntimeStatus {...commandState} commandFailure={commandFailure} thread={chatThread} />
      </ChatProviderSignInProvider>
    )
  }

  const view = renderWithProviders(statusTree(commandState.commandFailure), { queryClient })

  return {
    rerender(commandFailure: string | null) {
      view.rerender(statusTree(commandFailure))
    },
  }
}
