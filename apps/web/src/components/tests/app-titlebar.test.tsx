import { createDefaultWorkbenchLayout } from '@/features/workbench/utils/workbench-layout'
import { screen } from '@testing-library/react'

import { AppTitlebar } from '@/components/app-titlebar'
import { EditorStateProvider } from '@/features/editor/editor-state-provider'
import {
  createEditorWorkspaceStore,
  EditorWorkspaceStateContext,
} from '@/features/editor/state/editor-workspace-state'
import { createDefaultChatModePanels } from '@/features/chat-mode/utils/panels'
import { DEFAULT_DIFF_VIEW_MODE } from '@/features/editor/utils/diff-view-mode'
import {
  createDefaultWorkbenchPanels,
  openEditorPathInWorkbenchPanels,
} from '@/features/workbench/utils/workbench-panels'
import { NATIVE_WINDOW_DRAG_CLASS } from '@/lib/platform/window-drag'
import { expect, test } from '../../../test/fixtures'
import { renderWithProviders } from '../../../test/render'

test('renders app-owned window chrome as the only native drag region', () => {
  const store = createTitlebarStore()

  renderWithProviders(<TitlebarTestProvider store={store} />)

  const toolbar = screen.getByRole('banner', { name: 'Window toolbar' })
  expect(toolbar).toHaveClass(NATIVE_WINDOW_DRAG_CLASS)
  expect(toolbar).toHaveStyle({ gridTemplateColumns: '24% minmax(0, 1fr) auto' })
  expect(screen.getByText('repo')).toBeVisible()
  expect(screen.getByText('app.tsx')).toBeVisible()
})

function TitlebarTestProvider({
  store,
}: {
  readonly store: ReturnType<typeof createTitlebarStore>
}) {
  // Real editor stack, with only the workspace store swapped for the fixture: the
  // titlebar's project menu opens roots, so it needs the document and ui stores too.
  return (
    <EditorStateProvider>
      <EditorWorkspaceStateContext.Provider value={store}>
        <AppTitlebar />
      </EditorWorkspaceStateContext.Provider>
    </EditorStateProvider>
  )
}

function createTitlebarStore() {
  const panels = openEditorPathInWorkbenchPanels(
    createDefaultWorkbenchPanels(),
    '/repo/src/app.tsx',
  )

  return createEditorWorkspaceStore({
    chatModePanels: createDefaultChatModePanels(),
    diffViewMode: DEFAULT_DIFF_VIEW_MODE,
    rootFolder: {
      birthtimeMs: 0,
      mtimeMs: 0,
      name: 'repo',
      path: '/repo',
      size: 0,
      type: 'directory',
      version: '',
    },
    searchBuffers: {},
    uiMode: 'workbench',
    wallpaperHidden: false,
    workbenchLayout: createDefaultWorkbenchLayout(),
    workspaceOrder: ['/repo'],
    workspaces: {
      '/repo': {
        editorHistory: [],
        recentlyClosedEditorPaths: [],
        workbenchPanels: panels,
      },
    },
  })
}
