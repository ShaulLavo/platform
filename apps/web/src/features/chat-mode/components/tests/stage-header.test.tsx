import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useSessionRailStore } from '@/features/chat-mode/state/session-rail-store'
import { createRailHarness, renderRailHarness } from '../../../../../test/factories/rail-harness'
import { expect, test } from '../../../../../test/fixtures'

test('header rename targets the selected scoped session on its real server', async ({
  client,
  server,
}) => {
  const h = await createRailHarness(client, server)
  renderRailHarness(h, true)
  await userEvent.click(screen.getByRole('button', { name: 'Session actions' }))
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }))
  expect(useSessionRailStore.getState().renaming).toEqual({
    surface: 'header',
    ref: { environmentId: h.environmentId, sessionId: h.sessionIds[0] },
  })
  const input = screen.getByRole('textbox', { name: 'Session title' })
  await userEvent.clear(input)
  await userEvent.type(input, 'Header title{Enter}')
  await waitFor(async () =>
    expect(
      (await h.refresh()).sessions.find((session) => session.id === h.sessionIds[0])?.title,
    ).toBe('Header title'),
  )
})
test('empty header rename leaves the persisted title intact', async ({ client, server }) => {
  const h = await createRailHarness(client, server)
  renderRailHarness(h, true)
  await userEvent.click(screen.getByRole('button', { name: 'Session actions' }))
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }))
  const input = screen.getByRole('textbox', { name: 'Session title' })
  await userEvent.clear(input)
  await userEvent.type(input, '   {Enter}')
  expect(
    (await h.refresh()).sessions.find((session) => session.id === h.sessionIds[0])?.title,
  ).toBe('First')
})
