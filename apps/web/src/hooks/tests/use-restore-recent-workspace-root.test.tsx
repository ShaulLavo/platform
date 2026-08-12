import { waitFor } from '@testing-library/react'

import { createDefaultChatModePanels } from '@/features/chat-mode/utils/panels'
import { EditorStateProvider } from '@/features/editor/editor-state-provider'
import {
  createEditorWorkspaceStore,
  EditorWorkspaceStateContext,
} from '@/features/editor/state/editor-workspace-state'
import { DEFAULT_DIFF_VIEW_MODE } from '@/features/editor/utils/diff-view-mode'
import { useRestoreRecentWorkspaceRoot } from '@/hooks/use-restore-recent-workspace-root'
import { useWorkspaceCachePersistence } from '@/hooks/use-workspace-cache-persistence'
import { ensureFolderPath, recordRecentEntry } from '@/lib/file-server'
import { WORKSPACE_CACHE_STORAGE_KEYS, readWorkspaceCache } from '@/lib/workspace-cache'
import { createDefaultWorkbenchLayout } from '@/features/workbench/utils/workbench-layout'
import { expect, test } from '../../../test/fixtures'
import { renderWithProviders } from '../../../test/render'

test('restores the most recent backend folder when browser workspace state is empty', async ({
  client,
}) => {
  void client
  localStorage.removeItem(WORKSPACE_CACHE_STORAGE_KEYS.rootFolder)
  await ensureFolderPath('anubis')
  await recordRecentEntry('anubis')
  const workspaceStore = emptyWorkspaceStore()

  renderWithProviders(
    <EditorStateProvider>
      <EditorWorkspaceStateContext.Provider value={workspaceStore}>
        <RecentWorkspaceRecovery />
      </EditorWorkspaceStateContext.Provider>
    </EditorStateProvider>,
  )

  await waitFor(() => expect(workspaceStore.getState().rootFolder?.path).toBe('anubis'))
  await waitFor(() => expect(readWorkspaceCache().rootFolder?.path).toBe('anubis'))
})

function RecentWorkspaceRecovery() {
  useWorkspaceCachePersistence()
  useRestoreRecentWorkspaceRoot()

  return null
}

function emptyWorkspaceStore() {
  return createEditorWorkspaceStore({
    chatModePanels: createDefaultChatModePanels(),
    diffViewMode: DEFAULT_DIFF_VIEW_MODE,
    rootFolder: null,
    searchBuffers: {},
    uiMode: 'workbench',
    wallpaperHidden: false,
    workbenchLayout: createDefaultWorkbenchLayout(),
    workspaceOrder: [],
    workspaces: {},
  })
}
