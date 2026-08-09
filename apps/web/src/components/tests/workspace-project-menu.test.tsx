import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { WorkspaceProjectMenu } from '@/components/workspace-project-menu'
import { createDefaultChatModePanels } from '@/features/chat-mode/utils/panels'
import { EditorStateProvider } from '@/features/editor/editor-state-provider'
import {
  createEditorWorkspaceStore,
  EditorWorkspaceStateContext,
} from '@/features/editor/state/editor-workspace-state'
import { DEFAULT_DIFF_VIEW_MODE } from '@/features/editor/utils/diff-view-mode'
import { createDefaultWorkbenchLayout } from '@/features/workbench/utils/workbench-layout'
import { createDefaultWorkbenchPanels } from '@/features/workbench/utils/workbench-panels'
import { expect, test } from '../../../test/fixtures'
import { renderWithProviders } from '../../../test/render'

function storeWithRoot(path: string | null) {
  return createEditorWorkspaceStore({
    chatModePanels: createDefaultChatModePanels(),
    diffViewMode: DEFAULT_DIFF_VIEW_MODE,
    rootFolder: path
      ? {
          birthtimeMs: 0,
          mtimeMs: 0,
          name: path.split('/').filter(Boolean).at(-1) ?? path,
          path,
          size: 0,
          type: 'directory' as const,
          version: '',
        }
      : null,
    searchBuffers: {},
    uiMode: 'workbench',
    wallpaperHidden: false,
    workbenchLayout: createDefaultWorkbenchLayout(),
    workspaceOrder: path ? [path] : [],
    workspaces: path
      ? {
          [path]: {
            editorHistory: [],
            recentlyClosedEditorPaths: [],
            workbenchPanels: createDefaultWorkbenchPanels(),
          },
        }
      : {},
  })
}

function renderMenu(rootPath: string | null) {
  // Real editor stack with the workspace store swapped, so the menu gets the
  // document and ui stores it needs to open a root.
  return renderWithProviders(
    <EditorStateProvider>
      <EditorWorkspaceStateContext.Provider value={storeWithRoot(rootPath)}>
        <WorkspaceProjectMenu workspaceTitle='platform' />
      </EditorWorkspaceStateContext.Provider>
    </EditorStateProvider>,
  )
}

test('opens without a render failure and lists recents under a heading', async () => {
  renderMenu('/repo/platform')

  // Opening is the assertion: base-ui throws outright if a group label sits
  // outside its group, and nothing catches that until the menu is rendered.
  await userEvent.click(screen.getByRole('button', { name: 'Switch project' }))

  expect(await screen.findByText('Recent')).toBeVisible()
  expect(screen.getByRole('menuitem', { name: /Open folder/ })).toBeVisible()
})

test('offers the open project as the checked entry before recents load', async () => {
  renderMenu('/repo/platform')

  await userEvent.click(screen.getByRole('button', { name: 'Switch project' }))

  const items = await screen.findAllByRole('menuitemradio')
  expect(items).toHaveLength(1)
  expect(items[0]).toHaveTextContent('platform')
})

test('still offers a way out when no workspace is open', async () => {
  renderMenu(null)

  await userEvent.click(screen.getByRole('button', { name: 'Switch project' }))

  expect(screen.queryAllByRole('menuitemradio')).toHaveLength(0)
  expect(await screen.findByRole('menuitem', { name: /Open folder/ })).toBeVisible()
})
