import { useEffect } from 'react'
import { act, waitFor } from '@testing-library/react'
import type { SettingsMutationRequest, SettingsValues } from '@workspace/contracts'

import { EditorTabActionsProvider } from '@/features/editor/providers/tab-actions-provider'
import { EditorStateProvider } from '@/features/editor/providers/state-provider'
import {
  resetSettingsIntentStore,
  useSettingsIntentStore,
} from '@/features/settings/state/intent-store'
import { resetSettingsSnapshotAdmission } from '@/features/settings/state/snapshot-admission'
import { fetchSettings } from '@/features/settings/utils/api'
import { settingsKeys } from '@/features/settings/utils/query-keys'
import { writeRootFolderCache } from '@/features/workspace/state/cache'
import { useCommand } from '@/keymap/hooks/use-command'
import { CommandProvider } from '@/keymap/providers/command-provider'
import type { PlatformCommandBus } from '@/keymap/providers/command-context'
import { expect, test } from '../../../test/fixtures'
import { createTestQueryClient, renderWithProviders } from '../../../test/render'

let capturedBus: PlatformCommandBus | null = null

test.beforeEach(() => {
  capturedBus = null
  resetSettingsIntentStore()
  writeRootFolderCache(null)
})

test.afterEach(() => {
  capturedBus = null
  resetSettingsIntentStore()
  writeRootFolderCache(null)
})

test('consecutive toggles project landed settings intents before React renders', async ({
  controlledClient,
}) => {
  const queryClient = createTestQueryClient()
  const before = await fetchSettings()
  queryClient.setQueryData(settingsKeys.document(), before)
  const view = renderWithProviders(
    <EditorStateProvider>
      <EditorTabActionsProvider requestCloseTab={rejectCloseTab} requestCloseTabs={rejectCloseTabs}>
        <CommandProvider>
          <BusCapture />
        </CommandProvider>
      </EditorTabActionsProvider>
    </EditorStateProvider>,
    { command: false, queryClient },
  )
  await waitFor(() => expect(capturedBus).not.toBeNull())
  if (!capturedBus) return

  let first!: ReturnType<PlatformCommandBus['dispatch']>
  let second!: ReturnType<PlatformCommandBus['dispatch']>
  act(() => {
    first = capturedBus!.dispatch('workspace.toggleWallpaper', invocation())
    second = capturedBus!.dispatch('workspace.toggleWallpaper', invocation())
  })

  expect(first.claimed).toBe(true)
  expect(second.claimed).toBe(true)
  expect(useSettingsIntentStore.getState().active.map((entry) => entry.request.operations)).toEqual(
    [
      [{ key: 'workbench.wallpaper.enabled', kind: 'set', value: false }],
      [{ key: 'workbench.wallpaper.enabled', kind: 'set', value: true }],
    ],
  )

  await controlledClient.controller.waitForSettingsWriteRequest(2)
  const requests =
    (await controlledClient.controller.settingsWriteRequests()) as SettingsMutationRequest[]
  expect(requests.map((request) => request.operations)).toEqual([
    [{ key: 'workbench.wallpaper.enabled', kind: 'set', value: false }],
    [{ key: 'workbench.wallpaper.enabled', kind: 'set', value: true }],
  ])
  await expect(first.completion).resolves.toEqual({ status: 'handled' })
  await expect(second.completion).resolves.toEqual({ status: 'handled' })

  view.unmount()
  resetSettingsSnapshotAdmission(queryClient)
  queryClient.clear()
})

test('consecutive toggles replay intents before the confirmed settings query lands', async ({
  controlledClient,
}) => {
  const queryClient = createTestQueryClient()
  const view = renderCommandProvider(queryClient)
  await waitFor(() => expect(capturedBus).not.toBeNull())
  queryClient.removeQueries({ queryKey: settingsKeys.document() })
  expect(queryClient.getQueryData(settingsKeys.document())).toBeUndefined()
  if (!capturedBus) return

  let first!: ReturnType<PlatformCommandBus['dispatch']>
  let second!: ReturnType<PlatformCommandBus['dispatch']>
  act(() => {
    first = capturedBus!.dispatch('workspace.toggleWallpaper', invocation())
    second = capturedBus!.dispatch('workspace.toggleWallpaper', invocation())
  })

  expect(useSettingsIntentStore.getState().active.map((entry) => entry.request.operations)).toEqual(
    [
      [{ key: 'workbench.wallpaper.enabled', kind: 'set', value: false }],
      [{ key: 'workbench.wallpaper.enabled', kind: 'set', value: true }],
    ],
  )
  await controlledClient.controller.waitForSettingsWriteRequest(2)
  await expect(first.completion).resolves.toEqual({ status: 'handled' })
  await expect(second.completion).resolves.toEqual({ status: 'handled' })

  view.unmount()
  resetSettingsSnapshotAdmission(queryClient)
  queryClient.clear()
})

test('consecutive color-mode commands read intents before React renders', async ({
  controlledClient,
}) => {
  const queryClient = createTestQueryClient()
  const confirmed = await fetchSettings()
  queryClient.setQueryData(settingsKeys.document(), confirmed)
  const view = renderCommandProvider(queryClient)
  await waitFor(() => expect(capturedBus).not.toBeNull())
  if (!capturedBus) return

  const confirmedTheme = confirmed.values['workbench.colorTheme']
  const firstTheme = confirmedTheme === 'dark' ? 'light' : 'dark'
  let first!: ReturnType<PlatformCommandBus['dispatch']>
  let second!: ReturnType<PlatformCommandBus['dispatch']>
  act(() => {
    first = capturedBus!.dispatch(themeCommand(firstTheme), invocation())
    second = capturedBus!.dispatch(themeCommand(confirmedTheme), invocation())
  })

  expect(first.claimed).toBe(true)
  expect(second.claimed).toBe(true)
  expect(useSettingsIntentStore.getState().active.map((entry) => entry.request.operations)).toEqual(
    [
      [{ key: 'workbench.colorTheme', kind: 'set', value: firstTheme }],
      [{ key: 'workbench.colorTheme', kind: 'set', value: confirmedTheme }],
    ],
  )

  await controlledClient.controller.waitForSettingsWriteRequest(2)
  await expect(first.completion).resolves.toEqual({ status: 'handled' })
  await expect(second.completion).resolves.toEqual({ status: 'handled' })

  view.unmount()
  resetSettingsSnapshotAdmission(queryClient)
  queryClient.clear()
})

function BusCapture() {
  const { bus } = useCommand()
  useEffect(() => captureBus(bus), [bus])
  return null
}

function captureBus(bus: PlatformCommandBus) {
  capturedBus = bus
}

function renderCommandProvider(queryClient: ReturnType<typeof createTestQueryClient>) {
  return renderWithProviders(
    <EditorStateProvider>
      <EditorTabActionsProvider requestCloseTab={rejectCloseTab} requestCloseTabs={rejectCloseTabs}>
        <CommandProvider>
          <BusCapture />
        </CommandProvider>
      </EditorTabActionsProvider>
    </EditorStateProvider>,
    { command: false, queryClient },
  )
}

function invocation() {
  return { source: { caller: 'command-provider-test', kind: 'programmatic' } } as const
}

function themeCommand(theme: SettingsValues['workbench.colorTheme']) {
  if (theme === 'dark') return 'workspace.setDarkTheme' as const
  if (theme === 'light') return 'workspace.setLightTheme' as const

  return 'workspace.setSystemTheme' as const
}

function rejectCloseTab() {
  return { reason: 'not-found', status: 'rejected' } as const
}

function rejectCloseTabs() {
  return { reason: 'not-found', status: 'rejected' } as const
}
