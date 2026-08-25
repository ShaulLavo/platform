import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SettingsMutationRequest } from '@workspace/contracts'
import { useState } from 'react'
import { vi } from 'vitest'

import { expect, test } from '../../../../test/fixtures'
import { createTestQueryClient, renderWithProviders } from '../../../../test/render'
import { CommandPalette } from '@/components/command-palette'
import { EditorStateProvider } from '@/features/editor/providers/state-provider'
import {
  resetSettingsIntentStore,
  useSettingsIntentStore,
} from '@/features/settings/state/intent-store'
import { resetSettingsSnapshotAdmission } from '@/features/settings/state/snapshot-admission'
import { fetchSettings } from '@/features/settings/utils/api'
import { settingsKeys } from '@/features/settings/utils/query-keys'
import { FocusProvider } from '@/features/workspace/providers/focus-provider'
import { TreeCommandsContext } from '@/features/workspace/providers/tree-commands-context'
import { writeRootFolderCache } from '@/features/workspace/state/cache'
import { createTreeCommandStore } from '@/features/workspace/state/tree-command-store'
import { usePlatformCommandDispatch } from '@/keymap/commands'
import type { PlatformCommandId } from '@/keymap/types'

test('real palette preview and cancel write nothing while selection dispatches one write', async ({
  controlledClient,
}) => {
  resetSettingsIntentStore()
  writeRootFolderCache(null)
  const queryClient = createTestQueryClient()
  const before = await fetchSettings()
  queryClient.setQueryData(settingsKeys.document(), before)
  const dispatches = vi.fn<(command: PlatformCommandId) => void>()
  const firstPalette = renderPalette(queryClient, dispatches)
  const user = userEvent.setup()
  const input = await screen.findByPlaceholderText(/Choose color mode/)

  expect(useSettingsIntentStore.getState().active).toEqual([])
  expect(controlledClient.controller.settingsWriteCount).toBe(0)
  expect(dispatches).not.toHaveBeenCalled()

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
  expect(dispatches).not.toHaveBeenCalled()

  await user.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByPlaceholderText(/Choose color mode/)).toBeNull())
  expect(document.documentElement).toHaveClass('dark')
  expect(useSettingsIntentStore.getState().active).toEqual([])
  expect(controlledClient.controller.settingsWriteCount).toBe(0)
  expect(dispatches).not.toHaveBeenCalled()
  expect((await fetchSettings()).serverVersion).toEqual(before.serverVersion)
  firstPalette.unmount()

  const secondPalette = renderPalette(queryClient, dispatches)
  await screen.findByPlaceholderText(/Choose color mode/)
  await user.click(screen.getByText('Dark'))

  await controlledClient.controller.waitForSettingsWriteRequest(1)
  await waitFor(async () => {
    expect((await fetchSettings()).values['workbench.colorTheme']).toBe('dark')
    expect(useSettingsIntentStore.getState().active).toEqual([])
  })
  expect(dispatches).toHaveBeenCalledOnce()
  expect(dispatches).toHaveBeenCalledWith('workspace.setDarkTheme')
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

function PaletteHarness({
  observeDispatch,
}: {
  readonly observeDispatch: (command: PlatformCommandId) => void
}) {
  const [open, setOpen] = useState(true)
  const [search, setSearch] = useState('color ')
  const dispatchPlatformCommand = usePlatformCommandDispatch()

  return (
    <CommandPalette
      bindings={[]}
      dispatch={(command, event) => {
        observeDispatch(command)
        return dispatchPlatformCommand(command, event)
      }}
      onOpenChange={setOpen}
      onSearchChange={setSearch}
      open={open}
      search={search}
    />
  )
}

function renderPalette(
  queryClient: ReturnType<typeof createTestQueryClient>,
  observeDispatch: (command: PlatformCommandId) => void,
) {
  const treeCommandStore = createTreeCommandStore()

  return renderWithProviders(
    <EditorStateProvider>
      <FocusProvider>
        <TreeCommandsContext value={treeCommandStore}>
          <PaletteHarness observeDispatch={observeDispatch} />
        </TreeCommandsContext>
      </FocusProvider>
    </EditorStateProvider>,
    { queryClient, theme: 'dark' },
  )
}

function highlightedPaletteItem() {
  return document.querySelector<HTMLElement>('[cmdk-item][data-selected="true"]')
}
