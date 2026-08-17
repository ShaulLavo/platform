import { createDefaultWorkbenchLayout } from '@/features/workbench/utils/layout'
import { createDefaultChatModePanels } from '@/features/chat-mode/utils/panels'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

import { expect, test } from '../../../test/fixtures'
import {
  createEditorWorkspaceStore,
  EditorWorkspaceStateContext,
} from '@/features/editor/state/workspace-state'
import { useValidateRootFolder } from '@/hooks/use-validate-root-folder'
import { createFileContent, ensureFolderPath } from '@/lib/file-server'
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

test('keeps a cached root folder that still exists', async ({ client }) => {
  void client
  await ensureFolderPath('repo')
  const store = storeWithRoot(pickedDirectory('repo'))

  renderValidation(store)

  await new Promise((resolve) => setTimeout(resolve, 50))
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
  const wrapper = ({ children }: { children: ReactNode }) => (
    <EditorWorkspaceStateContext.Provider value={store}>
      {children}
    </EditorWorkspaceStateContext.Provider>
  )

  return renderHook(() => useValidateRootFolder(), { wrapper })
}
