import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { createDefaultChatModePanels } from '@/features/chat-mode/utils/panels'
import { EditorStateProvider } from '@/features/editor/editor-state-provider'
import {
  createEditorWorkspaceStore,
  EditorWorkspaceStateContext,
} from '@/features/editor/state/editor-workspace-state'
import { DEFAULT_DIFF_VIEW_MODE } from '@/features/editor/utils/diff-view-mode'
import { useOpenWorkspaceRoot } from '@/hooks/use-open-workspace-root'
import { ensureFolderPath, fetchRecentEntries } from '@/lib/file-server'
import { createDefaultWorkbenchLayout } from '@/features/workbench/utils/workbench-layout'
import { expect, test } from '../../../test/fixtures'
import { renderWithProviders } from '../../../test/render'

test('records an opened root as recent, so the project menu can order by it', async ({
  client,
}) => {
  void client
  await ensureFolderPath('anubis')
  renderOpener('anubis')

  await userEvent.click(screen.getByRole('button', { name: 'Open root' }))

  // Recorded through the real route: the picker is no longer the only way in.
  await waitFor(async () => {
    const recents = await fetchRecentEntries(10, new AbortController().signal)
    expect(recents.map((entry) => entry.path)).toEqual(['anubis'])
  })
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

function renderOpener(rootPath: string) {
  return renderWithProviders(
    <EditorStateProvider>
      <EditorWorkspaceStateContext.Provider value={emptyWorkspaceStore()}>
        <OpenRootButton rootPath={rootPath} />
      </EditorWorkspaceStateContext.Provider>
    </EditorStateProvider>,
  )
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
