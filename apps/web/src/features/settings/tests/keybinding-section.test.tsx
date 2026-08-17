import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { fetchSettings } from '@/features/settings/utils/api'

import { KeybindingSection } from '../components/keybinding-section'
import { expect, test } from '../../../../test/fixtures'
import { renderWithProviders } from '../../../../test/render'

const SAVE_RECORDER = 'Record a shortcut for workspace.saveFile'

// The regression the whole plan exists to fix: the control this replaces made
// the user type `workspace.saveFile` from memory before it showed a recorder.
test('lists commands by title rather than by id', async ({ client }) => {
  expect(client).toBeDefined()
  renderWithProviders(<KeybindingSection />)

  expect(await screen.findByText('Save')).toBeDefined()
  expect(screen.getByRole('button', { name: SAVE_RECORDER })).toBeDefined()
})

test('the search box narrows the list', async ({ client }) => {
  expect(client).toBeDefined()
  renderWithProviders(<KeybindingSection />)
  expect(await screen.findByRole('button', { name: SAVE_RECORDER })).toBeDefined()

  await userEvent.type(screen.getByLabelText('Search keyboard shortcuts'), 'sidebar')

  expect(screen.queryByRole('button', { name: SAVE_RECORDER })).toBeNull()
  expect(screen.getByText('Toggle Files pane')).toBeDefined()
})

test('says so when nothing matches', async ({ client }) => {
  expect(client).toBeDefined()
  renderWithProviders(<KeybindingSection />)
  expect(await screen.findByRole('button', { name: SAVE_RECORDER })).toBeDefined()

  await userEvent.type(screen.getByLabelText('Search keyboard shortcuts'), 'zzznope')

  expect(screen.getByText('No commands match this search.')).toBeDefined()
})

// The negative of the write test: a Reset button wired to always-enabled would
// still pass that one.
test('an untouched row offers nothing to undo', async ({ client }) => {
  expect(client).toBeDefined()
  renderWithProviders(<KeybindingSection />)

  expect(await screen.findByRole('button', { name: 'Reset Save' })).toBeDisabled()
  expect(screen.queryByText('Custom')).toBeNull()
})

test('recording a chord writes the override through, and Reset takes it back out', async ({
  client,
}) => {
  expect(client).toBeDefined()
  renderWithProviders(<KeybindingSection />)

  const recorder = await screen.findByRole('button', { name: SAVE_RECORDER })
  await userEvent.click(recorder)
  fireEvent.keyDown(recorder, { altKey: true, key: 'j', metaKey: true })

  await waitFor(async () => {
    const snapshot = await fetchSettings()
    expect(snapshot.values['keybindings.overrides']['workspace.saveFile']).toBe('Mod+Alt+J')
  })

  await userEvent.click(await screen.findByRole('button', { name: 'Reset Save' }))

  // `saveCollection` sends no value once the record is back at the registry
  // default, so the key leaves the user file entirely rather than becoming null.
  await waitFor(async () => {
    const snapshot = await fetchSettings()
    expect(snapshot.values['keybindings.overrides']).not.toHaveProperty('workspace.saveFile')
  })
})

// `null` is "this command has no shortcut"; an absent key is "use the default".
// toBeNull, not toBeFalsy — an absent key is falsy too, and is the other one.
test('Unbind writes null rather than removing the key', async ({ client }) => {
  expect(client).toBeDefined()
  renderWithProviders(<KeybindingSection />)

  await userEvent.click(await screen.findByRole('button', { name: 'Unbind Save' }))

  await waitFor(async () => {
    const snapshot = await fetchSettings()
    expect(snapshot.values['keybindings.overrides']['workspace.saveFile']).toBeNull()
  })
})
