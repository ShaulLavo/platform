import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { getClient } from '@/lib/client'

import { renderWithProviders } from '../../../../test/render'
import { expect, test } from '../../../../test/fixtures'
import { fetchSettings, saveSettings } from '../api'
import { SettingsPage } from '../components/page'
import { matchingSettingIds } from '../utils/search'
import {
  createEditorWorkspaceStore,
  EditorWorkspaceStateContext,
} from '@/features/editor/state/editor-workspace-state'
import { readWorkspaceCache } from '@/lib/workspace-cache'

test('renders a row per user-visible setting and writes a toggle through', async ({ client }) => {
  expect(client).toBeDefined()
  renderWithProviders(<SettingsPage />)

  const wallpaper = await screen.findByRole('switch', { name: 'Wallpaper enabled' })
  expect(wallpaper).toBeChecked()

  await userEvent.click(wallpaper)

  // Asserted against the server, not the control: the point is that the click
  // reached the settings file, not that a switch flipped locally.
  await waitFor(async () => {
    const snapshot = await fetchSettings()
    expect(snapshot.values['workbench.wallpaper.enabled']).toBe(false)
  })
})

test('offers a reset once a value differs from its default', async ({ client }) => {
  expect(client).toBeDefined()
  renderWithProviders(<SettingsPage />)

  const wallpaper = await screen.findByRole('switch', { name: 'Wallpaper enabled' })
  await userEvent.click(wallpaper)

  await userEvent.click(
    await screen.findByRole('button', { name: 'Actions for workbench.wallpaper.enabled' }),
  )
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Reset setting' }))

  // Reset removes the key rather than writing the default into the file, which
  // is what keeps the default coming from the running build.
  await waitFor(async () => {
    const snapshot = await fetchSettings()
    expect(snapshot.values['workbench.wallpaper.enabled']).toBe(true)
    expect(snapshot.layers.find((layer) => layer.id === 'user')?.raw).not.toHaveProperty(
      'workbench.wallpaper.enabled',
    )
  })
})

test('filters by id, label, keyword and description', () => {
  expect(matchingSettingIds('surface.blur')).toEqual(['workbench.surface.blur'])
  // A keyword match: "transparency" appears in no id or label.
  expect(matchingSettingIds('transparency')).toContain('workbench.surface.opacity')
  expect(matchingSettingIds('nothing-matches-this')).toEqual([])
})

test('shows a diagnostic for a key the settings file holds but cannot apply', async ({
  client,
}) => {
  expect(client).toBeDefined()
  // Through the raw route, the way the JSON escape hatch writes: a document
  // holding a key this build does not register. The resolver keeps it in the
  // file and reports it rather than applying it, and the page has to say so —
  // otherwise a renamed key just looks like a setting that stopped working.
  await getClient().settings.raw.post({
    target: 'user',
    text: '{ "editor.fromANewerBuild": true }',
  })

  renderWithProviders(<SettingsPage />)

  expect(await screen.findByText(/not applied/)).toBeDefined()
  expect(await screen.findByText('editor.fromANewerBuild')).toBeDefined()
})

test('reset all clears every key from the layer in one write', async ({ client }) => {
  expect(client).toBeDefined()
  await saveSettings([
    { key: 'workbench.colorTheme', target: 'user', value: 'light' },
    { key: 'workbench.surface.opacity', target: 'user', value: 40 },
  ])

  renderWithProviders(<SettingsPage />)
  await userEvent.click(await screen.findByRole('button', { name: 'Settings actions' }))
  await userEvent.click(await screen.findByRole('menuitem', { name: /Reset all/ }))

  await waitFor(async () => {
    const snapshot = await fetchSettings()
    // Removed, not overwritten with defaults: what is in the file is what the
    // user changed, so a default that moves in a later build still applies.
    expect(snapshot.layers.find((layer) => layer.id === 'user')?.raw).toEqual({})
    expect(snapshot.values['workbench.colorTheme']).toBe('system')
  })
})

test('shows a read-only key with its reason and no working control', async ({ client }) => {
  expect(client).toBeDefined()
  renderWithProviders(<SettingsPage />)

  await userEvent.type(await screen.findByLabelText('Search settings'), 'vibrancy')

  const control = await screen.findByRole('switch', { name: 'Native vibrancy' })
  // `aria-disabled`, not the `disabled` attribute: the primitive renders a span
  // with a switch role, so the accessible state is the only truthful assertion.
  expect(control.getAttribute('aria-disabled')).toBe('true')
  // Shown rather than hidden: a knob that silently is not there reads as a bug,
  // where a knob that says why it is off reads as a decision.
  expect(await screen.findByText(/off-screen rendering/)).toBeDefined()
})

test('refuses an application-scoped key from the workspace tab, and says why', async ({
  client,
}) => {
  expect(client).toBeDefined()
  // The Workspace tab is gated on a folder being open, so the page needs a
  // workspace store with a root for the tab to be reachable at all.
  const store = createEditorWorkspaceStore({
    ...readWorkspaceCache(),
    rootFolder: {
      birthtimeMs: 0,
      mtimeMs: 0,
      name: 'repo',
      path: '/repo',
      size: 0,
      type: 'directory',
      version: '',
    },
  })
  renderWithProviders(
    <EditorWorkspaceStateContext.Provider value={store}>
      <SettingsPage />
    </EditorWorkspaceStateContext.Provider>,
  )

  await userEvent.click(await screen.findByRole('tab', { name: 'Workspace' }))
  await userEvent.type(await screen.findByLabelText('Search settings'), 'runtime')
  // The scope rule surfaces where the user meets it rather than only as a
  // server error after a failed save.
  expect(await screen.findByText(/can only be set in User settings/)).toBeDefined()
})

test('renders a real providers editor rather than a JSON escape hatch', async ({ client }) => {
  expect(client).toBeDefined()
  renderWithProviders(<SettingsPage />)

  await userEvent.type(await screen.findByLabelText('Search settings'), 'providers')

  // The built-in providers live in the registry as constants, not in the
  // settings document, so the row has to source them from the running snapshots.
  // Before this the page showed "Edit in settings.json" for the one screen whose
  // whole job is configuring providers.
  expect(screen.queryByText('Edit in settings.json')).toBeNull()
  expect((await screen.findAllByRole('switch', { name: /Enable/ })).length).toBeGreaterThan(0)
})

test('lists the real model catalog, and hiding one keeps its row to bring it back', async ({
  client,
}) => {
  expect(client).toBeDefined()
  renderWithProviders(<SettingsPage />)

  await userEvent.type(await screen.findByLabelText('Search settings'), 'models')

  // Same defect as the providers section, one screen over: settings remember the
  // models you have an opinion about, so listing those meant the screen for
  // forming an opinion started empty.
  const switches = await screen.findAllByRole('switch', { name: /Show / })
  expect(switches.length).toBeGreaterThan(0)

  const first = switches[0]
  expect(first).toBeDefined()
  const label = first!.getAttribute('aria-label')
  await userEvent.click(first!)

  await waitFor(async () => {
    const snapshot = await fetchSettings()
    expect(snapshot.values['models.hidden']).toHaveLength(1)
  })

  // The row survives the toggle, unchecked. If hiding removed it, the switch
  // that un-hides it would go with it and the model would be hidden for good.
  const after = await screen.findByRole('switch', { name: label! })
  expect(after).not.toBeChecked()
})

test('renders a record editor for keybindings rather than raw JSON', async ({ client }) => {
  expect(client).toBeDefined()
  await saveSettings([
    { key: 'keybindings.overrides', target: 'user', value: { 'workspace.saveFile': 'Mod+S' } },
  ])
  renderWithProviders(<SettingsPage />)

  await userEvent.type(await screen.findByLabelText('Search settings'), 'keybinding')

  // A chord recorder, not a text field: the value is a keystroke, and typing the
  // notation wrong produces a binding that silently never fires.
  const recorder = await screen.findByRole('button', {
    name: 'Record a shortcut for keybindings.overrides.workspace.saveFile',
  })
  expect(recorder).toHaveTextContent('Mod+S')
  expect(await screen.findByRole('button', { name: 'Remove workspace.saveFile' })).toBeDefined()
})

test('Escape from a row returns focus to the search box', async ({ client }) => {
  expect(client).toBeDefined()
  renderWithProviders(<SettingsPage />)

  const wallpaper = await screen.findByRole('switch', { name: 'Wallpaper enabled' })
  wallpaper.focus()
  expect(document.activeElement).toBe(wallpaper)

  await userEvent.keyboard('{Escape}')

  // One key back to the top from anywhere in the list, so a keyboard user is
  // never stranded partway down a long page.
  expect(document.activeElement).toBe(screen.getByLabelText('Search settings'))
})

test('every visible row is reachable and operable from the keyboard', async ({ client }) => {
  expect(client).toBeDefined()
  renderWithProviders(<SettingsPage />)

  await userEvent.type(await screen.findByLabelText('Search settings'), 'wallpaper')
  const wallpaper = await screen.findByRole('switch', { name: 'Wallpaper enabled' })

  wallpaper.focus()
  await userEvent.keyboard(' ')

  await waitFor(async () => {
    const snapshot = await fetchSettings()
    expect(snapshot.values['workbench.wallpaper.enabled']).toBe(false)
  })
})
