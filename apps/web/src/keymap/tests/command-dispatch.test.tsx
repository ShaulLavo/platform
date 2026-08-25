import type { QueryClient } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

import { FocusProvider } from '@/features/workspace/providers/focus-provider'
import { TreeCommandsContext } from '@/features/workspace/providers/tree-commands-context'
import { createTreeCommandStore } from '@/features/workspace/state/tree-command-store'
import { writeRootFolderCache } from '@/features/workspace/state/cache'
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
    mutationId: 'command-dispatch-external-wallpaper',
    operations: [{ key: 'workbench.wallpaper.enabled', kind: 'set', value: !mounted }],
    target: 'user',
  })
  await queryClient.invalidateQueries({ queryKey: settingsKeys.document() })
  await waitFor(async () => expect(await stored('workbench.wallpaper.enabled')).toBe(!mounted))

  dispatch.current('workspace.toggleWallpaper')

  await waitFor(async () => expect(await stored('workbench.wallpaper.enabled')).toBe(mounted))
})

test('dispatches durable file-tree requests while the Files pane is unmounted', async () => {
  const { dispatch, treeCommandStore } = await mountDispatch({ rootPath: '/repo' })

  dispatch.current('workspace.focusFileTree')
  expect(treeCommandStore.getSnapshot()).toEqual({
    id: 1,
    kind: 'focus',
    rootPath: '/repo',
  })

  dispatch.current('workspace.findInFileTree')
  expect(treeCommandStore.getSnapshot()).toEqual({
    id: 2,
    kind: 'open-search',
    rootPath: '/repo',
  })
})

async function stored<K extends 'editor.diff.viewMode' | 'workbench.wallpaper.enabled'>(key: K) {
  return (await fetchSettings()).values[key]
}

async function mountDispatch({ rootPath }: { readonly rootPath?: string } = {}) {
  const queryClient = createTestQueryClient()
  const treeCommandStore = createTreeCommandStore()
  if (rootPath) writeRootFolderCache(pickedDirectory(rootPath))

  function Wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <AppProviders queryClient={queryClient}>
        <EditorStateProvider>
          <FocusProvider>
            <TreeCommandsContext value={treeCommandStore}>{children}</TreeCommandsContext>
          </FocusProvider>
        </EditorStateProvider>
      </AppProviders>
    )
  }

  const { result } = renderHook(() => usePlatformCommandDispatch(), { wrapper: Wrapper })
  if (rootPath) writeRootFolderCache(null)

  return { dispatch: result, hydrated: hydratedValue(queryClient), queryClient, treeCommandStore }
}

function pickedDirectory(path: string) {
  return {
    birthtimeMs: 0,
    mtimeMs: 0,
    name: path.split('/').at(-1) ?? path,
    path,
    size: 0,
    type: 'directory' as const,
    version: '',
  }
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
