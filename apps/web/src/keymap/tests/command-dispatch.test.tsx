import type { QueryClient } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

import { FocusProvider } from '@/features/workspace/providers/focus-provider'
import { EditorStateProvider } from '@/features/editor/providers/state-provider'
import { fetchSettings, saveSettings } from '@/features/settings/utils/api'
import { settingsKeys } from '@/features/settings/utils/query-keys'
import { usePlatformCommandDispatch } from '@/keymap/commands'

import { expect, test } from '../../../test/fixtures'
import { AppProviders, createTestQueryClient } from '../../../test/render'

test('toggling the wallpaper twice returns it to where it started', async ({ client }) => {
  expect(client).toBeDefined()
  const { dispatch, hydrated } = await mountDispatch()
  const before = await hydrated('workbench.wallpaper.enabled')

  dispatch.current('workspace.toggleWallpaper')
  await waitFor(async () => expect(await stored('workbench.wallpaper.enabled')).toBe(!before))

  dispatch.current('workspace.toggleWallpaper')
  await waitFor(async () => expect(await stored('workbench.wallpaper.enabled')).toBe(before))
})

test('toggling the diff view mode twice returns it to where it started', async ({ client }) => {
  expect(client).toBeDefined()
  const { dispatch, hydrated } = await mountDispatch()
  const before = await hydrated('editor.diff.viewMode')

  dispatch.current('workspace.toggleDiffViewMode')
  await waitFor(async () => expect(await stored('editor.diff.viewMode')).not.toBe(before))

  dispatch.current('workspace.toggleDiffViewMode')
  await waitFor(async () => expect(await stored('editor.diff.viewMode')).toBe(before))
})

test('a single wallpaper toggle flips the value rather than rewriting it', async ({ client }) => {
  expect(client).toBeDefined()
  const { dispatch, hydrated } = await mountDispatch()
  const before = await hydrated('workbench.wallpaper.enabled')

  dispatch.current('workspace.toggleWallpaper')

  await waitFor(async () => expect(await stored('workbench.wallpaper.enabled')).toBe(!before))
})

test('the toggle starts from a setting changed after mount, not the mounted value', async ({
  client,
}) => {
  expect(client).toBeDefined()
  const { dispatch, hydrated, queryClient } = await mountDispatch()
  const mounted = await hydrated('workbench.wallpaper.enabled')

  // The settings page's write path, then the refresh the settings stream does
  // in production — the command must see the new value, not the mounted one.
  await saveSettings({
    edits: [{ key: 'workbench.wallpaper.enabled', target: 'user', value: !mounted }],
  })
  await queryClient.invalidateQueries({ queryKey: settingsKeys.document() })
  await waitFor(async () => expect(await stored('workbench.wallpaper.enabled')).toBe(!mounted))

  dispatch.current('workspace.toggleWallpaper')

  await waitFor(async () => expect(await stored('workbench.wallpaper.enabled')).toBe(mounted))
})

async function stored<K extends 'editor.diff.viewMode' | 'workbench.wallpaper.enabled'>(key: K) {
  return (await fetchSettings()).values[key]
}

async function mountDispatch() {
  const queryClient = createTestQueryClient()

  function Wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <AppProviders queryClient={queryClient}>
        <EditorStateProvider>
          <FocusProvider>{children}</FocusProvider>
        </EditorStateProvider>
      </AppProviders>
    )
  }

  const { result } = renderHook(() => usePlatformCommandDispatch(), { wrapper: Wrapper })

  return { dispatch: result, hydrated: hydratedValue(queryClient), queryClient }
}

/**
 * Resolves once the hook's own query holds the key, so a test never races the
 * first fetch and mistakes the registry default for the stored value.
 */
function hydratedValue(queryClient: QueryClient) {
  return async <K extends 'editor.diff.viewMode' | 'workbench.wallpaper.enabled'>(key: K) => {
    await waitFor(() => expect(cachedValues(queryClient)?.[key]).toBeDefined())

    return cachedValues(queryClient)?.[key] as NonNullable<ReturnType<typeof cachedValues>>[K]
  }
}

function cachedValues(queryClient: QueryClient) {
  return queryClient.getQueryData<Awaited<ReturnType<typeof fetchSettings>>>(
    settingsKeys.document(),
  )?.values
}
