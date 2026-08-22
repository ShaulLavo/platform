import { act, fireEvent, renderHook, screen, waitFor } from '@testing-library/react'
import { FileTree } from '@workspace/tree/utils/render/FileTree'
import type { ReactNode } from 'react'
import { vi } from 'vitest'

import { TreeToolbar } from '@/features/workspace/components/tree-toolbar'
import { useFileTreeMutationEvents } from '@/features/workspace/hooks/use-file-tree-mutation-events'
import { useTreeCommandRequest } from '@/features/workspace/hooks/use-tree-command-request'
import { TreeCommandsContext } from '@/features/workspace/providers/tree-commands-context'
import { createTreeCommandStore } from '@/features/workspace/state/tree-command-store'
import { log } from '@/lib/client-logging'

import { expect, test } from '../../../../test/fixtures'
import { renderWithProviders } from '../../../../test/render'

test('offers root create, filter, and reveal actions with accessible labels', () => {
  const actions = toolbarActions()
  renderWithProviders(<TreeToolbar {...actions} isSearchOpen={false} matchCount={0} query='' />)

  fireEvent.click(screen.getByRole('button', { name: 'New file at workspace root' }))
  fireEvent.click(screen.getByRole('button', { name: 'New folder at workspace root' }))
  fireEvent.click(screen.getByRole('button', { name: 'Filter files' }))
  fireEvent.click(screen.getByRole('button', { name: 'Reveal active file in tree' }))

  expect(actions.onNewFile).toHaveBeenCalledOnce()
  expect(actions.onNewFolder).toHaveBeenCalledOnce()
  expect(actions.onOpenSearch).toHaveBeenCalledOnce()
  expect(actions.onRevealActiveFile).toHaveBeenCalledOnce()
})

test('exposes the complete active search session controls and live match count', () => {
  const actions = toolbarActions()
  renderWithProviders(<TreeToolbar {...actions} isSearchOpen matchCount={3} query='work' />)

  expect(screen.getByRole('status', { name: '3 file matches' })).toHaveTextContent('3 matches')
  fireEvent.click(screen.getByRole('button', { name: 'Previous file match' }))
  fireEvent.click(screen.getByRole('button', { name: 'Next file match' }))
  fireEvent.click(screen.getByRole('button', { name: 'Clear file filter' }))
  fireEvent.click(screen.getByRole('button', { name: 'Close file filter' }))

  expect(actions.onPreviousMatch).toHaveBeenCalledOnce()
  expect(actions.onNextMatch).toHaveBeenCalledOnce()
  expect(actions.onClearSearch).toHaveBeenCalledOnce()
  expect(actions.onCloseSearch).toHaveBeenCalledOnce()
})

test('disables traversal and clear while the retained query is empty', () => {
  renderWithProviders(<TreeToolbar {...toolbarActions()} isSearchOpen matchCount={0} query='' />)

  expect(screen.getByRole('button', { name: 'Previous file match' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Next file match' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Clear file filter' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Close file filter' })).toBeEnabled()
})

test('delivers a pre-mount tree request to its matching root', () => {
  const store = createTreeCommandStore()
  store.request('focus', '/repo')
  const { result } = renderHook(() => useTreeCommandRequest('/repo'), {
    wrapper: treeCommandWrapper(store),
  })

  expect(result.current.request).toEqual({ id: 1, kind: 'focus', rootPath: '/repo' })
  act(() => result.current.acknowledge(1))
  expect(result.current.request).toBeNull()
})

test('discards a pending request owned by another root', async () => {
  const store = createTreeCommandStore()
  store.request('focus', '/old-root')
  const { result } = renderHook(() => useTreeCommandRequest('/current-root'), {
    wrapper: treeCommandWrapper(store),
  })

  expect(result.current.request).toBeNull()
  await waitFor(() => expect(store.getSnapshot()).toBeNull())
})

test('logs one wide event for a batch and unsubscribes on unmount', () => {
  const tree = new FileTree({ paths: ['a.ts', 'old/'] })
  const info = vi.spyOn(log, 'info').mockImplementation(() => {})
  const { unmount } = renderHook(() => useFileTreeMutationEvents({ rootPath: '/repo', tree }))

  try {
    act(() => {
      tree.batch([
        { path: 'old/', recursive: true, type: 'remove' },
        { path: 'b.ts', type: 'add' },
      ])
    })

    expect(info).toHaveBeenCalledOnce()
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'file-tree.mutation',
        area: 'file-tree',
        batchChildCount: 2,
        operation: 'batch',
        rootPath: '/repo',
      }),
    )

    unmount()
    tree.add('c.ts')
    expect(info).toHaveBeenCalledOnce()
  } finally {
    info.mockRestore()
    tree.cleanUp()
  }
})

function toolbarActions() {
  return {
    onClearSearch: vi.fn(),
    onCloseSearch: vi.fn(),
    onNewFile: vi.fn(),
    onNewFolder: vi.fn(),
    onNextMatch: vi.fn(),
    onOpenSearch: vi.fn(),
    onPreviousMatch: vi.fn(),
    onRevealActiveFile: vi.fn(),
  }
}

function treeCommandWrapper(store: ReturnType<typeof createTreeCommandStore>) {
  return function TreeCommandWrapper({ children }: { readonly children: ReactNode }) {
    return <TreeCommandsContext value={store}>{children}</TreeCommandsContext>
  }
}
