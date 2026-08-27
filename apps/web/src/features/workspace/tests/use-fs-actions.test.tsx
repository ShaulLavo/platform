import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { FileTreeModel } from '@workspace/tree'
import type { ReactNode } from 'react'
import { vi } from 'vitest'

import { WorkspaceEditServiceContext } from '@/features/editor/providers/workspace-edit-context'
import type { WorkspaceEditService } from '@/features/editor/state/workspace-edit-service'
import { useFsActions } from '@/features/workspace/hooks/use-fs-actions'
import { createFileContent, ensureFolderPath, fetchFile, fetchTree } from '@/lib/file-server'
import type { TreeEntry } from '@/lib/file-system-types'
import { createClientError } from '@/lib/structured-errors'
import { treeModel } from '@/lib/tree-model'

import { expect, test } from '../../../../test/fixtures'
import { createTestQueryClient } from '../../../../test/render'

test('gates file create, rename, copy, and delete with their exact mutated paths', async ({
  client,
}) => {
  void client
  await ensureFolderPath('repo')
  await createFileContent('repo/rename.ts', 'rename\n')
  await createFileContent('repo/copy.ts', 'copy\n')
  await createFileContent('repo/delete.ts', 'delete\n')
  const harness = await renderFsActions('repo')

  act(() => {
    harness.result.current.actions.createEntry('', false)
    harness.result.current.completeRename({
      destinationPath: 'created.ts',
      isFolder: false,
      sourcePath: 'untitled',
    })
  })
  await harness.service.waitForSettled(1)

  act(() => {
    harness.result.current.completeRename({
      destinationPath: 'renamed.ts',
      isFolder: false,
      sourcePath: 'rename.ts',
    })
  })
  await harness.service.waitForSettled(2)

  act(() => harness.result.current.actions.duplicateEntry('copy.ts', false))
  await harness.service.waitForSettled(3)

  act(() => {
    harness.result.current.actions.requestDelete({
      isDirectory: false,
      name: 'delete.ts',
      path: 'repo/delete.ts',
    })
  })
  await waitFor(() => expect(harness.result.current.deleteDialog.target).not.toBeNull())
  act(() => harness.result.current.deleteDialog.onConfirm())
  await harness.service.waitForSettled(4)

  expect(harness.service.affectedPaths).toEqual([
    ['repo/created.ts'],
    ['repo/rename.ts', 'repo/renamed.ts'],
    ['repo/copy copy.ts'],
    ['repo/delete.ts'],
  ])
  await expect(readContent('repo/created.ts')).resolves.toBe('')
  await expect(readContent('repo/renamed.ts')).resolves.toBe('rename\n')
  await expect(readContent('repo/copy copy.ts')).resolves.toBe('copy\n')
  await expect(treePaths('repo')).resolves.not.toContain('repo/delete.ts')

  harness.cleanUp()
})

test('invalidates all workspace-edit history for directory tree mutations', async ({ client }) => {
  void client
  await ensureFolderPath('repo/rename-dir')
  await ensureFolderPath('repo/copy-dir')
  await ensureFolderPath('repo/delete-dir')
  await createFileContent('repo/rename-dir/a.ts', 'rename\n')
  await createFileContent('repo/copy-dir/a.ts', 'copy\n')
  await createFileContent('repo/delete-dir/a.ts', 'delete\n')
  const harness = await renderFsActions('repo')

  act(() => {
    harness.result.current.completeRename({
      destinationPath: 'renamed-dir',
      isFolder: true,
      sourcePath: 'rename-dir',
    })
  })
  await harness.service.waitForSettled(1)

  act(() => harness.result.current.actions.duplicateEntry('copy-dir', true))
  await harness.service.waitForSettled(2)

  act(() => {
    harness.result.current.actions.requestDelete({
      isDirectory: true,
      name: 'delete-dir',
      path: 'repo/delete-dir',
    })
  })
  await waitFor(() => expect(harness.result.current.deleteDialog.target).not.toBeNull())
  act(() => harness.result.current.deleteDialog.onConfirm())
  await harness.service.waitForSettled(3)

  expect(harness.service.affectedPaths).toEqual(['all', 'all', 'all'])
  await expect(readContent('repo/renamed-dir/a.ts')).resolves.toBe('rename\n')
  await expect(readContent('repo/copy-dir copy/a.ts')).resolves.toBe('copy\n')
  await expect(treePaths('repo')).resolves.not.toContain('repo/delete-dir')

  harness.cleanUp()
})

test('keeps optimistic rollback when the authoritative mutation reservation rejects', async ({
  client,
}) => {
  void client
  await ensureFolderPath('repo')
  await createFileContent('repo/old.ts', 'old\n')
  const service = new RecordingWorkspaceEditService({ reject: true })
  const harness = await renderFsActions('repo', service)
  harness.tree.move('old.ts', 'new.ts')
  const move = vi.spyOn(harness.tree, 'move')

  act(() => {
    harness.result.current.completeRename({
      destinationPath: 'new.ts',
      isFolder: false,
      sourcePath: 'old.ts',
    })
  })

  await waitFor(() => expect(move).toHaveBeenCalledWith('new.ts', 'old.ts'))
  expect(service.affectedPaths).toEqual([['repo/old.ts', 'repo/new.ts']])
  await expect(readContent('repo/old.ts')).resolves.toBe('old\n')
  await expect(treePaths('repo')).resolves.not.toContain('repo/new.ts')

  harness.cleanUp()
})

async function renderFsActions(rootPath: string, service = new RecordingWorkspaceEditService()) {
  const model = treeModel(await fetchTree(rootPath, signal()), rootPath)
  const tree = new FileTreeModel({ paths: model.paths, renaming: true })
  const queryClient = createTestQueryClient()

  function Wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <WorkspaceEditServiceContext value={service.asService()}>
          {children}
        </WorkspaceEditServiceContext>
      </QueryClientProvider>
    )
  }

  const modelRef = { current: model }
  const treeRef = { current: tree }
  const hook = renderHook(() => useFsActions({ modelRef, rootPath, treeRef }), {
    wrapper: Wrapper,
  })

  return {
    ...hook,
    cleanUp: () => {
      hook.unmount()
      queryClient.clear()
      tree.cleanUp()
    },
    service,
    tree,
  }
}

class RecordingWorkspaceEditService {
  readonly affectedPaths: Array<readonly string[] | 'all'> = []
  readonly canMutateWorkspace = () => true
  readonly subscribe = () => () => undefined
  #settled = 0
  readonly #reject: boolean

  constructor({ reject = false }: { readonly reject?: boolean } = {}) {
    this.#reject = reject
  }

  asService() {
    return this as unknown as WorkspaceEditService
  }

  async runWorkspaceMutation<T>(
    affectedPaths: readonly string[] | 'all',
    operation: () => Promise<T>,
  ): Promise<T> {
    this.affectedPaths.push(affectedPaths)
    if (this.#reject) throw busyError()

    const result = await operation()
    this.#settled += 1
    return result
  }

  async waitForSettled(count: number) {
    await waitFor(() => expect(this.#settled).toBe(count))
  }
}

function busyError() {
  return createClientError({
    code: 'workspace-edit-busy',
    fix: 'Retry after the active workspace mutation finishes.',
    message: 'Another workspace mutation is active',
    status: 409,
    why: 'The workspace mutation coordinator is already reserved.',
  })
}

async function readContent(path: string) {
  const result = await fetchFile(path, signal())
  return result.content
}

async function treePaths(path: string) {
  const result = await fetchTree(path, signal())
  return flattenedPaths(result.entries)
}

function flattenedPaths(entries: readonly TreeEntry[]) {
  const paths: string[] = []
  for (const entry of entries) {
    paths.push(entry.path)
    if (!entry.children) continue

    paths.push(...flattenedPaths(entry.children))
  }
  return paths
}

function signal() {
  return new AbortController().signal
}
