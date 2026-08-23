import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import path from 'node:path'

import { createDefaultChatModePanels } from '@/features/chat-mode/utils/panels'
import { EditorStateProvider } from '@/features/editor/providers/state-provider'
import {
  createEditorWorkspaceStore,
  EditorWorkspaceStateContext,
} from '@/features/editor/state/workspace-state'
import {
  useOpenWorkspaceRoot,
  type OpenWorkspaceRootResult,
} from '@/features/workspace/hooks/use-open-root'
import {
  createFileContent,
  ensureFolderPath,
  fetchRecentEntries,
  fetchServerInfo,
} from '@/lib/file-server'
import { createDefaultWorkbenchLayout } from '@/features/workbench/utils/layout'
import { expect, test } from '../../../../test/fixtures'
import { renderWithProviders } from '../../../../test/render'

test('records an opened root as recent, so the project menu can order by it', async ({
  client,
}) => {
  void client
  await ensureFolderPath('anubis')
  renderOpener('anubis')

  await userEvent.click(screen.getByRole('button', { name: 'Open root' }))

  // Recorded through the real route: the picker is no longer the only way in.
  await waitFor(async () => {
    const recents = await fetchRecentEntries(
      { limit: 10, mode: 'folder', showHidden: true },
      new AbortController().signal,
    )
    expect(recents.map((entry) => entry.path)).toEqual(['anubis'])
  })
})

test('makes the latest rapid valid open the editor and index root', async ({ client, server }) => {
  void client
  await ensureFolderPath('a')
  await ensureFolderPath('b')
  await createFileContent('a/only-a.ts', 'export const a = true\n')
  await createFileContent('b/only-b.ts', 'export const b = true\n')
  const store = emptyWorkspaceStore()
  const results: Array<{ path: string; result: OpenWorkspaceRootResult }> = []
  renderOpeners(store, ['a', 'b'], results)

  await userEvent.click(screen.getByRole('button', { name: 'Open rapidly' }))

  await waitFor(() => expect(store.getState().rootFolder?.path).toBe('b'))
  await waitFor(() => expect(results).toContainEqual({ path: 'b', result: 'opened' }))
  await waitFor(async () => {
    const info = await fetchServerInfo(new AbortController().signal)
    expect(info.workspaceIndex?.scanRoot).toBe(path.join(server.root, 'b'))
  })
  expect(results).toContainEqual({ path: 'a', result: 'superseded' })
})

test('does not retarget the index when a newer folder open is rejected', async ({
  client,
  server,
}) => {
  void client
  await ensureFolderPath('valid')
  await createFileContent('not-a-folder.txt', 'file\n')
  const store = emptyWorkspaceStore()
  const results: Array<{ path: string; result: OpenWorkspaceRootResult }> = []
  renderOpeners(store, ['valid', 'not-a-folder.txt'], results)

  await userEvent.click(screen.getByRole('button', { name: 'Open valid' }))
  await waitFor(() => expect(store.getState().rootFolder?.path).toBe('valid'))
  const baseline = await fetchServerInfo(new AbortController().signal)

  await userEvent.click(screen.getByRole('button', { name: 'Open not-a-folder.txt' }))
  await waitFor(() =>
    expect(results).toContainEqual({ path: 'not-a-folder.txt', result: 'failed' }),
  )
  const afterRejectedOpen = await fetchServerInfo(new AbortController().signal)

  expect(store.getState().rootFolder?.path).toBe('valid')
  expect(afterRejectedOpen.workspaceIndex?.scanRoot).toBe(baseline.workspaceIndex?.scanRoot)
  expect(afterRejectedOpen.workspaceIndex?.scanRoot).toBe(path.join(server.root, 'valid'))
})

/** The hook is the chokepoint for the project menu and the chat rail alike. */
function OpenRootButton({ rootPath }: { readonly rootPath: string }) {
  const openWorkspaceRoot = useOpenWorkspaceRoot()

  return (
    <button type='button' onClick={() => void openWorkspaceRoot(rootPath)}>
      Open root
    </button>
  )
}

function OpenRootButtons({
  onResult,
  rootPaths,
}: {
  readonly onResult: (path: string, result: OpenWorkspaceRootResult) => void
  readonly rootPaths: readonly string[]
}) {
  const openWorkspaceRoot = useOpenWorkspaceRoot()

  const open = (rootPath: string) => {
    void openWorkspaceRoot(rootPath).then((result) => onResult(rootPath, result))
  }

  return (
    <>
      {rootPaths.map((rootPath) => (
        <button key={rootPath} type='button' onClick={() => open(rootPath)}>
          Open {rootPath}
        </button>
      ))}
      <button
        type='button'
        onClick={() => {
          for (const rootPath of rootPaths) open(rootPath)
        }}
      >
        Open rapidly
      </button>
    </>
  )
}

function renderOpener(rootPath: string) {
  return renderWithProviders(
    <EditorStateProvider>
      <EditorWorkspaceStateContext.Provider value={emptyWorkspaceStore()}>
        <OpenRootButton rootPath={rootPath} />
      </EditorWorkspaceStateContext.Provider>
    </EditorStateProvider>,
  )
}

function renderOpeners(
  store: ReturnType<typeof emptyWorkspaceStore>,
  rootPaths: readonly string[],
  results: Array<{ path: string; result: OpenWorkspaceRootResult }>,
) {
  return renderWithProviders(
    <EditorStateProvider>
      <EditorWorkspaceStateContext.Provider value={store}>
        <OpenRootButtons
          onResult={(path, result) => results.push({ path, result })}
          rootPaths={rootPaths}
        />
      </EditorWorkspaceStateContext.Provider>
    </EditorStateProvider>,
  )
}

function emptyWorkspaceStore() {
  return createEditorWorkspaceStore({
    chatModePanels: createDefaultChatModePanels(),
    rootFolder: null,
    searchBuffers: {},
    uiMode: 'workbench',
    workbenchLayout: createDefaultWorkbenchLayout(),
    workspaceOrder: [],
    workspaces: {},
  })
}
