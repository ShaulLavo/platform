import { QueryClient } from '@tanstack/react-query'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { MachinesSection } from '@/features/settings/components/machines-section'
import { useSettingValue } from '@/features/settings/hooks/use-setting-value'
import { useSettingsActions } from '@/features/settings/hooks/use-settings-actions'
import { fetchSettings, saveSettings } from '@/features/settings/utils/api'
import { settingsKeys } from '@workspace/client-core/settings/query-keys'
import { registerEnvironmentQueryClient } from '@/lib/environments/state/query-clients'
import { createEnvironmentConnections } from '@/state/environment-connections'
import { createInProcessClient } from '../../../../../test/client'
import { expect, test } from '../../../../../test/fixtures'
import {
  createTestQueryClient,
  renderHookWithProviders,
  renderWithProviders,
} from '../../../../../test/render'
import { makeTestServer } from '../../../../../test/server'

test('adds, relabels, and removes an SSH machine through the real settings file', async ({
  client,
}) => {
  const connections = createEnvironmentConnections({ activateEnvironment: () => {} })
  renderWithProviders(<MachinesSection disabled={false} />, { connections })
  await userEvent.click(screen.getByRole('button', { name: 'Add machine' }))
  await userEvent.type(screen.getByLabelText('Machine name'), 'build-machine')
  await userEvent.type(screen.getByLabelText('SSH target'), 'builder@localhost')
  await userEvent.type(screen.getByLabelText('Repository path'), '/work/projects/platform')
  await userEvent.click(screen.getByRole('button', { name: 'Add machine' }))
  await waitFor(async () => {
    const snapshot = await fetchSettings(undefined, client)
    expect(snapshot.values['environments.machines']['build-machine']).toMatchObject({
      target: 'builder@localhost',
    })
    connections.configureMachines(snapshot.values['environments.machines'])
  })
  expect(await screen.findByText('Desktop only')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Connect' })).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
  await userEvent.type(screen.getByLabelText('Display label'), 'Build host')
  await userEvent.click(screen.getByRole('button', { name: 'Save machine' }))
  expect(await screen.findByText('Build host')).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
  await waitFor(async () =>
    expect((await fetchSettings(undefined, client)).values['environments.machines']).toEqual({}),
  )
  connections.stop()
})

test('refuses an off-loopback plain HTTP URL before writing settings', async ({ client }) => {
  renderWithProviders(<MachinesSection disabled={false} />)
  await userEvent.click(screen.getByRole('button', { name: 'Add machine' }))
  await userEvent.type(screen.getByLabelText('Machine name'), 'remote')
  await userEvent.click(screen.getByRole('combobox', { name: 'Connection' }))
  await userEvent.click(await screen.findByRole('option', { name: 'Direct origin' }))
  await userEvent.type(screen.getByLabelText('Server URL'), 'http://10.0.0.5:3001')
  await userEvent.click(screen.getByRole('button', { name: 'Add machine' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'plain http off loopback is refused; use an SSH machine or https',
  )
  expect((await fetchSettings(undefined, client)).values['environments.machines']).toEqual({})
})

test('global values and semantic writes keep the primary owner under another editor query client', async ({
  client,
}) => {
  const serverB = await makeTestServer({ filesystemWatch: false })
  const clientB = createInProcessClient(serverB)
  const primary = createTestQueryClient()
  const editor = new QueryClient()
  registerEnvironmentQueryClient(editor, 'http://localhost:3512', clientB)
  await saveSettings(
    {
      mutationId: 'primary-size',
      target: 'user',
      operations: [{ kind: 'set', key: 'editor.fontSize', value: 19 }],
    },
    client,
  )
  primary.setQueryData(settingsKeys.document(), await fetchSettings(undefined, client))
  editor.setQueryData(settingsKeys.document(), await fetchSettings(undefined, clientB))
  const rendered = renderHookWithProviders(
    () => ({ value: useSettingValue('editor.fontSize'), actions: useSettingsActions() }),
    { queryClient: editor, settingsOwner: primary },
  )
  try {
    await waitFor(() => expect(rendered.result.current.value).toBe(19))
    await act(async () => {
      const submission = rendered.result.current.actions.setMachine('remote', {
        kind: 'origin',
        url: 'http://localhost:3512',
      })
      if (submission.kind === 'submitted') await submission.settled
    })
    expect((await fetchSettings(undefined, client)).values['environments.machines']).toHaveProperty(
      'remote',
    )
    expect((await fetchSettings(undefined, clientB)).values['environments.machines']).toEqual({})
  } finally {
    rendered.unmount()
    primary.clear()
    editor.clear()
    await serverB.cleanup()
  }
})
