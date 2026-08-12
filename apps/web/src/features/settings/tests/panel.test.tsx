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

test('lists the running providers even when nothing has been saved', async ({ client }) => {
  expect(client).toBeDefined()
  renderWithProviders(<SettingsPanel />)

  // An untouched server has an empty settings document and live providers, and
  // the section has to show the second rather than report the first.
  expect(await screen.findByRole('switch', { name: /Enable/ })).toBeDefined()
  expect(screen.getByText('No model preferences yet.')).toBeDefined()
  // Shortcuts have no empty state: every command ships with its default in the
  // list so there is something to edit before any override exists.
  expect(shortcutField('Save')).toHaveProperty('value', 'Mod+S')
  expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull()
})

test('lists stored providers, models and shortcut overrides', async ({ client }) => {
  expect(client).toBeDefined()
  await seedSettings()

  renderWithProviders(<SettingsPanel />)

  expect(await screen.findByText('Codex (work)')).toBeDefined()
  expect(screen.getByText('gpt-5-codex')).toBeDefined()
  expect(screen.getByText('workspace.saveFile')).toBeDefined()
  expect(screen.getByText('Custom')).toBeDefined()
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

test('rebinding a shortcut persists through the real server', async ({ client }) => {
  expect(client).toBeDefined()
  renderWithProviders(<SettingsPanel />)

  await waitFor(() => expect(shortcutField('Save')).toBeDefined())
  await userEvent.clear(shortcutField('Save'))
  await userEvent.type(shortcutField('Save'), 'mod+alt+s')
  await userEvent.tab()

  await waitFor(async () => {
    const settings = await fetchSettings()
    expect(settings.keybindings['workspace.saveFile']).toBe('Mod+Alt+S')
  })
})

test('emptying a shortcut unbinds the command instead of restoring its default', async ({
  client,
}) => {
  expect(client).toBeDefined()
  renderWithProviders(<SettingsPanel />)

  await waitFor(() => expect(shortcutField('Save')).toBeDefined())
  await userEvent.clear(shortcutField('Save'))
  await userEvent.tab()

  await waitFor(async () => {
    const settings = await fetchSettings()
    expect(settings.keybindings['workspace.saveFile']).toBeNull()
  })
})

test('resetting a shortcut drops the override so the default applies again', async ({ client }) => {
  expect(client).toBeDefined()
  await seedSettings()
  renderWithProviders(<SettingsPanel />)

  await userEvent.click(await screen.findByRole('button', { name: 'Reset' }))

  await waitFor(async () => {
    const settings = await fetchSettings()
    expect('workspace.saveFile' in settings.keybindings).toBe(false)
  })
  expect(shortcutField('Save')).toHaveProperty('value', 'Mod+S')
})

test('refuses a shortcut no keyboard can produce', async ({ client }) => {
  expect(client).toBeDefined()
  renderWithProviders(<SettingsPanel />)

  await waitFor(() => expect(shortcutField('Save')).toBeDefined())
  await userEvent.clear(shortcutField('Save'))
  await userEvent.type(shortcutField('Save'), 'Mod+Nonsense')
  await userEvent.tab()

  expect(await screen.findByText('Not a shortcut')).toBeDefined()
  const settings = await fetchSettings()
  expect('workspace.saveFile' in settings.keybindings).toBe(false)
})

function shortcutField(command: string) {
  return screen.getByLabelText(`Shortcut for ${command}`)
}

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
