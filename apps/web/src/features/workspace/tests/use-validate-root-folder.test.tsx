import { createDefaultWorkbenchLayout } from '@/features/workbench/utils/layout'
import { createDefaultChatModePanels } from '@/features/chat-mode/utils/panels'
import { waitFor } from '@testing-library/react'
import path from 'node:path'
import { renderWithProviders } from '../../../../test/render'

import { expect, test } from '../../../../test/fixtures'
import {
  createEditorWorkspaceStore,
  EditorWorkspaceStateContext,
} from '@/features/editor/state/workspace-state'
import { useValidateRootFolder } from '@/features/workspace/hooks/use-validate-root-folder'
import { createFileContent, ensureFolderPath, fetchServerInfo } from '@/lib/file-server'
import type { PickedFsEntry } from '@/lib/file-system-types'

test('clears a cached root folder that no longer exists on disk', async ({ client }) => {
  void client
  const store = storeWithRoot(pickedDirectory('missing-workspace'))

  renderValidation(store)

  await waitFor(() => expect(store.getState().rootFolder).toBeNull())
})

test('clears a cached root folder that points at a file', async ({ client }) => {
  void client
  await ensureFolderPath('repo')
  await createFileContent('repo/notes.txt', 'hello')
  const store = storeWithRoot(pickedDirectory('repo/notes.txt'))

  renderValidation(store)

  await waitFor(() => expect(store.getState().rootFolder).toBeNull())
})

test('keeps a cached root folder that still exists and makes it the index scope', async ({
  client,
  server,
}) => {
  void client
  await ensureFolderPath('repo')
  const store = storeWithRoot(pickedDirectory('repo'))

  renderValidation(store)

  await waitFor(async () => {
    const info = await fetchServerInfo(new AbortController().signal)
    expect(info.workspaceIndex?.scanRoot).toBe(path.join(server.root, 'repo'))
  })
  expect(store.getState().rootFolder?.path).toBe('repo')
})

function pickedDirectory(path: string): PickedFsEntry {
  return {
    birthtimeMs: 0,
    mtimeMs: 0,
    name: path.split('/').at(-1) ?? path,
    path,
    size: 0,
    type: 'directory',
    version: '',
  }
}

function storeWithRoot(rootFolder: PickedFsEntry) {
  return createEditorWorkspaceStore({
    chatModePanels: createDefaultChatModePanels(),
    rootFolder,
    searchBuffers: {},
    uiMode: 'workbench',
    workbenchLayout: createDefaultWorkbenchLayout(),
    workspaceOrder: [rootFolder.path],
    workspaces: {},
  })
}

function renderValidation(store: ReturnType<typeof storeWithRoot>) {
  return renderWithProviders(
    <EditorWorkspaceStateContext.Provider value={store}>
      <RootValidation />
    </EditorWorkspaceStateContext.Provider>,
  )
}

function RootValidation() {
  useValidateRootFolder()
  return null
}
