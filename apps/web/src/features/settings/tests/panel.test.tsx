import { settingsPatchSchema } from '@workspace/contracts'
import { screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import * as v from 'valibot'

import { expect, test } from '../../../../test/fixtures'
import { renderWithProviders } from '../../../../test/render'
import { fetchSettings, saveSettings } from '../api'
import { SettingsPanel } from '../panel'

// Real routes, real store: the panel renders what the server actually holds and
// its toggles write back through the same routes the app uses.

test('renders empty sections for an untouched server', async ({ client }) => {
  expect(client).toBeDefined()
  renderWithProviders(<SettingsPanel />)

  expect(await screen.findByText('No provider instances configured yet.')).toBeDefined()
  expect(screen.getByText('No model preferences yet.')).toBeDefined()
  expect(screen.getByText('No shortcut overrides.')).toBeDefined()
})

test('lists stored providers, models and shortcut overrides', async ({ client }) => {
  expect(client).toBeDefined()
  await seedSettings()

  renderWithProviders(<SettingsPanel />)

  expect(await screen.findByText('Codex (work)')).toBeDefined()
  expect(screen.getByText('gpt-5-codex')).toBeDefined()
  expect(screen.getByText('workspace.saveFile')).toBeDefined()
  expect(screen.getByRole('switch', { name: 'Enable Codex (work)' })).toBeDefined()
})

test('disabling a provider persists through the real server', async ({ client }) => {
  expect(client).toBeDefined()
  await seedSettings()
  renderWithProviders(<SettingsPanel />)

  const toggle = await screen.findByRole('switch', { name: 'Enable Codex (work)' })
  await userEvent.click(toggle)

  await waitFor(async () => {
    const settings = await fetchSettings()
    expect(settings.providerInstances[0]?.enabled).toBe(false)
  })
})

function seedSettings() {
  return saveSettings(
    v.parse(settingsPatchSchema, {
      keybindings: { 'workspace.saveFile': 'mod+s' },
      models: { order: [{ providerInstanceId: 'codex-work', model: 'gpt-5-codex' }] },
      providerInstances: [
        { providerInstanceId: 'codex-work', driverKind: 'codex', displayLabel: 'Codex (work)' },
      ],
    }),
  )
}
