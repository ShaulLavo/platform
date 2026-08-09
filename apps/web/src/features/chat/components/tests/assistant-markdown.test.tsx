import { waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'

import { EditorStateProvider } from '@/features/editor/editor-state-provider'
import { useEditorUiState } from '@/features/editor/state/editor-ui-state'
import {
  createEditorWorkspaceStore,
  EditorWorkspaceStateContext,
  useEditorWorkspaceState,
} from '@/features/editor/state/editor-workspace-state'
import { createDefaultChatModePanels } from '@/features/chat-mode/utils/panels'
import { DEFAULT_DIFF_VIEW_MODE } from '@/features/editor/utils/diff-view-mode'
import { createDefaultWorkbenchLayout } from '@/features/workbench/utils/workbench-layout'
import { AssistantMarkdown } from '@/features/chat/components/assistant-markdown'
import { markdownHighlightCache } from '@/features/chat/state/markdown-highlight-cache'
import { expect, test } from '../../../../../test/fixtures'
import { renderWithProviders } from '../../../../../test/render'

const ROOT_PATH = '/repo'

test('an inline file reference opens the referenced file at its line', async () => {
  const user = userEvent.setup()
  const { getByRole, getByTestId } = renderMarkdown('See `src/foo.ts:42` for the fix.')

  await user.click(getByRole('link', { name: /src\/foo\.ts:42/u }))

  expect(getByTestId('selected-path')).toHaveTextContent('/repo/src/foo.ts')
  expect(getByTestId('definition-target')).toHaveTextContent('/repo/src/foo.ts@41')
})

test('a markdown link to a workspace file opens that file', async () => {
  const user = userEvent.setup()
  const { getByRole, getByTestId } = renderMarkdown('Look at [the module](src/deep/mod.ts).')

  await user.click(getByRole('link', { name: /src\/deep\/mod\.ts/u }))

  expect(getByTestId('selected-path')).toHaveTextContent('/repo/src/deep/mod.ts')
  expect(getByTestId('definition-target')).toHaveTextContent('none')
})

test('a web link is left to the markdown renderer, not turned into a file chip', () => {
  const { container } = renderMarkdown('Read [the docs](https://example.com/guide).')

  expect(container.querySelector('[data-chat-file-link]')).toBeNull()
  expect(container.textContent).toContain('the docs')
})

test('an over-indented list item renders as a list, not a code block', () => {
  const { container } = renderMarkdown('-       aligned bullet\n-       second bullet\n')

  expect(container.querySelector('ul')).not.toBeNull()
  expect(container.querySelector('[data-streamdown="code-block"]')).toBeNull()
  expect(container.textContent).toContain('aligned bullet')
})

test('a streaming code block is highlighted but never cached', async () => {
  markdownHighlightCache.clear()
  const { container } = renderMarkdown('```ts\nconst answer = 42\nconst other =', {
    streaming: true,
  })

  await waitFor(() => {
    expect(highlightTokens(container).length).toBeGreaterThan(1)
  })
  expect(markdownHighlightCache.size).toBe(0)
  expect(container.textContent).toContain('const other =')
})

test('a completed code block is highlighted and cached', async () => {
  markdownHighlightCache.clear()
  const { container } = renderMarkdown('```ts\nconst answer = 42\n```')

  await waitFor(() => {
    expect(highlightTokens(container).length).toBeGreaterThan(1)
  })
  expect(markdownHighlightCache.size).toBe(1)
  expect(markdownHighlightCache.totalBytes).toBeGreaterThan(0)
})

function highlightTokens(container: HTMLElement) {
  return container.querySelectorAll('[data-streamdown="code-block-body"] code span span')
}

function renderMarkdown(text: string, { streaming = false }: { streaming?: boolean } = {}) {
  return renderWithProviders(
    withEditorWorkspace(
      <>
        <AssistantMarkdown streaming={streaming} text={text} />
        <EditorSelectionProbe />
      </>,
    ),
  )
}

function withEditorWorkspace(children: ReactNode) {
  return (
    <EditorStateProvider>
      <EditorWorkspaceStateContext.Provider value={createWorkspaceStore()}>
        {children}
      </EditorWorkspaceStateContext.Provider>
    </EditorStateProvider>
  )
}

function EditorSelectionProbe() {
  const selectedFilePath = useEditorWorkspaceState((state) => state.selectedFilePath)
  const definitionTarget = useEditorUiState((state) => state.definitionTarget)

  return (
    <>
      <span data-testid='selected-path'>{selectedFilePath ?? 'none'}</span>
      <span data-testid='definition-target'>
        {definitionTarget
          ? `${definitionTarget.path}@${definitionTarget.range.start.line}`
          : 'none'}
      </span>
    </>
  )
}

function createWorkspaceStore() {
  return createEditorWorkspaceStore({
    chatModePanels: createDefaultChatModePanels(),
    diffViewMode: DEFAULT_DIFF_VIEW_MODE,
    rootFolder: {
      birthtimeMs: 0,
      mtimeMs: 0,
      name: 'repo',
      path: ROOT_PATH,
      size: 0,
      type: 'directory',
      version: '',
    },
    searchBuffers: {},
    uiMode: 'workbench',
    wallpaperHidden: false,
    workbenchLayout: createDefaultWorkbenchLayout(),
    workspaceOrder: [ROOT_PATH],
    workspaces: {},
  })
}
