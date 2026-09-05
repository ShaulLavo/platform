import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useQueryClient } from '@tanstack/react-query'
import type { SettingsMutationRequest } from '@workspace/contracts'

import { expect, test } from '../../../../test/fixtures'
import { createTestQueryClient, renderWithProviders } from '../../../../test/render'
import { TestCommandProvider } from '../../../../test/factories/command-runtime'
import { CommandPalette } from '@/components/command-palette'
import { TestEditorStateProvider as EditorStateProvider } from '../../../../test/factories/editor-state-provider'
import {
  resetSettingsIntentStore,
  useSettingsIntentStore,
} from '@/features/settings/state/intent-store'
import { resetSettingsSnapshotAdmission } from '@/features/settings/state/snapshot-admission'
import { fetchSettings } from '@/features/settings/utils/api'
import { settingsKeys } from '@/features/settings/utils/query-keys'
import { useTheme } from '@/features/settings/hooks/use-theme'
import { writeRootFolderCache } from '@/features/workspace/state/cache'

test('real palette preview and cancel write nothing while selection dispatches one write', async ({
  controlledClient,
}) => {
  resetSettingsIntentStore()
  writeRootFolderCache(null)
  const queryClient = createTestQueryClient()
  const before = await fetchSettings()
  queryClient.setQueryData(settingsKeys.document(), before)
  const firstPalette = renderPalette(queryClient)
  const user = userEvent.setup()
  const input = await screen.findByPlaceholderText(/Select a color mode/)

  expect(useSettingsIntentStore.getState().active).toEqual([])
  expect(controlledClient.controller.settingsWriteCount).toBe(0)

  await waitFor(() => {
    expect(highlightedPaletteItem()?.textContent).toContain('Light')
    expect(document.documentElement).toHaveClass('light')
  })
  await user.click(input)
  await user.keyboard('{ArrowDown}')
  await waitFor(() => {
    expect(highlightedPaletteItem()?.textContent).toContain('Dark')
    expect(document.documentElement).toHaveClass('dark')
  })
  expect(useSettingsIntentStore.getState().active).toEqual([])
  expect(controlledClient.controller.settingsWriteCount).toBe(0)

  await user.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByPlaceholderText(/Select a color mode/)).toBeNull())
  expect(document.documentElement).toHaveClass('dark')
  expect(useSettingsIntentStore.getState().active).toEqual([])
  expect(controlledClient.controller.settingsWriteCount).toBe(0)
  expect((await fetchSettings()).serverVersion).toEqual(before.serverVersion)
  firstPalette.unmount()

  const secondPalette = renderPalette(queryClient)
  await screen.findByPlaceholderText(/Select a color mode/)
  await user.click(screen.getByText('Dark'))

  await controlledClient.controller.waitForSettingsWriteRequest(1)
  await waitFor(async () => {
    expect((await fetchSettings()).values['workbench.colorTheme']).toBe('dark')
    expect(useSettingsIntentStore.getState().active).toEqual([])
  })
  expect(controlledClient.controller.settingsWriteCount).toBe(1)
  const requests =
    (await controlledClient.controller.settingsWriteRequests()) as SettingsMutationRequest[]
  expect(requests).toEqual([
    expect.objectContaining({
      mutationId: expect.any(String),
      operations: [{ key: 'workbench.colorTheme', kind: 'set', value: 'dark' }],
      target: 'user',
    }),
  ])
  expect((await fetchSettings()).serverVersion.sequence).toBe(before.serverVersion.sequence + 1)

  secondPalette.unmount()
  resetSettingsSnapshotAdmission(queryClient)
  resetSettingsIntentStore()
  queryClient.clear()
  writeRootFolderCache(null)
})

function PaletteHarness() {
  const queryClient = useQueryClient()
  const theme = useTheme()

  return (
    <TestCommandProvider
      options={{
        paletteOpen: true,
        paletteSearch: 'color ',
        runtime: { settings: { setTheme: theme.setTheme } },
      }}
      queryClient={queryClient}
    >
      <CommandPalette />
    </TestCommandProvider>
  )
}

function renderPalette(queryClient: ReturnType<typeof createTestQueryClient>) {
  return renderWithProviders(
    <EditorStateProvider>
      <PaletteHarness />
    </EditorStateProvider>,
    { command: false, queryClient, theme: 'dark' },
  )
}

function highlightedPaletteItem() {
  return document.querySelector<HTMLElement>('[cmdk-item][data-selected="true"]')
}
