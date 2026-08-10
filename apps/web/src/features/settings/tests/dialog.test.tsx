import { screen } from '@testing-library/react'

import { expect, test } from '../../../../test/fixtures'
import { renderWithProviders } from '../../../../test/render'
import { SettingsDialog } from '../components/dialog'

test('a closed dialog renders no settings surface at all', ({ client }) => {
  expect(client).toBeDefined()
  renderWithProviders(<SettingsDialog open={false} onOpenChange={() => {}} />)

  expect(screen.queryByRole('dialog')).toBeNull()
})

test('an open dialog shows the real settings panel', async ({ client }) => {
  expect(client).toBeDefined()
  renderWithProviders(<SettingsDialog open onOpenChange={() => {}} />)

  expect(await screen.findByRole('dialog', { name: 'Settings' })).toBeDefined()
  expect(await screen.findByText('No provider instances configured yet.')).toBeDefined()
})
