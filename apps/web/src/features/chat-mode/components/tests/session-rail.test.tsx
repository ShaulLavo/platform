import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { scopedSessionKey } from '@workspace/contracts'
import { createRailHarness, renderRailHarness } from '../../../../../test/factories/rail-harness'
import { expect, test } from '../../../../../test/fixtures'
import { useSessionSelectionStore } from '@/features/chat-mode/state/session-selection-store'
import { useSessionMultiSelectStore } from '@/features/chat-mode/state/session-multi-select-store'

test('renders the three projected attention sections and each session once', async ({
  client,
  server,
}) => {
  const harness = await createRailHarness(client, server)
  renderRailHarness(harness)
  for (const name of ['Needs input', 'Working', 'Settled'])
    expect(screen.getByRole('region', { name })).toBeVisible()
  expect(within(screen.getByRole('region', { name: 'Settled' })).getByTitle('First')).toBeVisible()
  expect(screen.getAllByTitle('First')).toHaveLength(1)
})
test('opens the owning worktree before publishing the scoped session selection', async ({
  client,
  server,
}) => {
  const harness = await createRailHarness(client, server)
  renderRailHarness(harness)
  await userEvent.click(screen.getByTitle('Second'))
  await waitFor(() =>
    expect(useSessionSelectionStore.getState().selection).toMatchObject({
      kind: 'session',
      environmentId: harness.environmentId,
      projectId: harness.projectId,
      sessionId: harness.sessionIds[1],
    }),
  )
  expect(harness.application.getSnapshot().editor.workspaceStore.getState().rootFolder?.path).toBe(
    harness.context.worktree!.path,
  )
})
test('range selection holds scoped references and Escape clears it', async ({ client, server }) => {
  const harness = await createRailHarness(client, server)
  renderRailHarness(harness)
  const user = userEvent.setup()
  await user.keyboard('{Control>}')
  await user.click(screen.getByTitle('First'))
  await user.click(screen.getByTitle('Second'))
  await user.keyboard('{/Control}')
  expect(useSessionMultiSelectStore.getState().refs.map(scopedSessionKey)).toEqual(
    harness.sessionIds.map((sessionId) =>
      scopedSessionKey({ environmentId: harness.environmentId, sessionId }),
    ),
  )
  await user.keyboard('{Escape}')
  expect(useSessionMultiSelectStore.getState().refs).toEqual([])
})
test('search narrows the rail without replacing the attention section', async ({
  client,
  server,
}) => {
  const harness = await createRailHarness(client, server)
  renderRailHarness(harness)
  await userEvent.type(screen.getByRole('searchbox', { name: 'Search sessions' }), 'Second')
  expect(screen.getByTitle('Second')).toBeVisible()
  expect(screen.queryByTitle('First')).toBeNull()
})
