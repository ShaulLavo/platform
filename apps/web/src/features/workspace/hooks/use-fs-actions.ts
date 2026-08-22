import type { FileTreeRenameEvent } from '@workspace/tree'
import type { FileTreeModel } from '@workspace/tree'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type RefObject } from 'react'

import {
  containerContentsLoaded,
  duplicateTreePath,
  newEntryTreePath,
  workspacePathForTreePath,
} from '@/features/workspace/utils/entry-paths'
import { invalidateTreeQueries } from '@/features/workspace/utils/invalidate-queries'
import { expandTreeDirectory } from '@/features/workspace/utils/tree-pane-state'
import { reportError, toClientError } from '@/lib/client-error-taxonomy'
import {
  copyPath,
  createFileContent,
  deletePath,
  ensureFolderPath,
  errorMessage,
  renamePath,
} from '@/lib/file-server'
import { canonicalTreePath } from '@/lib/path-formatters'
import type { TreeModel } from '@/lib/tree-model'

export type DeleteTarget = {
  readonly isDirectory: boolean
  readonly name: string
  /** Server path. Already resolved, so the dialog can show what will be removed. */
  readonly path: string
}

/**
 * The domain actions the row menu invokes. Everything is expressed in tree
 * paths because that is what the menu has; the server path is derived here.
 */
export type TreeFsActions = {
  readonly createEntry: (containerPath: string, isFolder: boolean) => void
  readonly duplicateEntry: (treePath: string, isDirectory: boolean) => void
  readonly renameEntry: (rowPath: string) => void
  readonly requestDelete: (target: DeleteTarget) => void
}

type CreateRequest = { isFolder: boolean; treePath: string }
type MoveRequest = { from: string; isFolder: boolean; to: string }
type DeferredCreate = { containerPath: string; isFolder: boolean }

/**
 * Owns every filesystem mutation the file tree can start, plus the delete
 * confirmation the menu cannot host itself — the menu unmounts the moment it
 * closes, so the dialog has to outlive it here.
 */
export function useFsActions({
  modelRef,
  rootPath,
  treeRef,
}: {
  modelRef: RefObject<TreeModel>
  rootPath: string
  treeRef: RefObject<FileTreeModel | null>
}) {
  const queryClient = useQueryClient()
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  // Set while an inline edit is creating rather than renaming, so the commit
  // handler knows to write a new entry instead of moving an existing one.
  const pendingCreatePathRef = useRef<string | null>(null)
  // Set while a create is waiting on its target directory to finish loading.
  const deferredCreateRef = useRef<DeferredCreate | null>(null)

  const createMutation = useMutation({
    mutationFn: (request: CreateRequest) => createEntryOnDisk(rootPath, request),
    onError: (error, request) => {
      // The tree already renamed the placeholder row optimistically; nothing on
      // disk backs it now, so drop it rather than leave a phantom.
      treeRef.current?.remove(rowPathForEntry(request.treePath, request.isFolder), {
        recursive: request.isFolder,
      })
      reportError(toClientError(error))
    },
    onSettled: () => invalidateTreeQueries(queryClient),
  })

  const renameMutation = useMutation({
    mutationFn: (request: MoveRequest) =>
      renamePath(
        workspacePathForTreePath(rootPath, request.from),
        workspacePathForTreePath(rootPath, request.to),
      ),
    onError: (error, request) => {
      // The refetched tree is identical to the one we already hold, so the path
      // sync has nothing to correct — put the row back by hand.
      treeRef.current?.move(
        rowPathForEntry(request.to, request.isFolder),
        rowPathForEntry(request.from, request.isFolder),
      )
      reportError(toClientError(error))
    },
    onSettled: () => invalidateTreeQueries(queryClient),
  })

  const duplicateMutation = useMutation({
    mutationFn: (request: MoveRequest) =>
      copyPath(
        workspacePathForTreePath(rootPath, request.from),
        workspacePathForTreePath(rootPath, request.to),
      ),
    onError: (error) => reportError(toClientError(error)),
    onSettled: () => invalidateTreeQueries(queryClient),
  })

  const deleteMutation = useMutation({
    mutationFn: (target: DeleteTarget) => deletePath(target.path, target.isDirectory),
    onSettled: () => invalidateTreeQueries(queryClient),
    onSuccess: () => setDeleteTarget(null),
  })

  function createEntry(containerPath: string, isFolder: boolean) {
    const tree = treeRef.current
    if (!tree) return
    if (containerContentsLoaded(modelRef.current.loadedDirectoryPaths, containerPath)) {
      startInlineCreate(tree, containerPath, isFolder)
      return
    }

    // Right-clicking a collapsed directory is the common way in, and its
    // children are still on the wire. Expand to kick the load off and let
    // `resumeDeferredCreate` start the edit once they have landed.
    deferredCreateRef.current = { containerPath, isFolder }
    expandTreeDirectory(tree, containerPath)
  }

  /** Called by the pane after each model sync, once per settled tree. */
  function resumeDeferredCreate() {
    const request = deferredCreateRef.current
    const tree = treeRef.current
    if (!request || !tree) return
    if (!containerContentsLoaded(modelRef.current.loadedDirectoryPaths, request.containerPath)) {
      return
    }

    deferredCreateRef.current = null
    startInlineCreate(tree, request.containerPath, request.isFolder)
  }

  function startInlineCreate(tree: FileTreeModel, containerPath: string, isFolder: boolean) {
    const placeholderPath = newEntryTreePath({
      containerPath,
      existingPaths: modelRef.current.entriesByTreePath,
      isFolder,
    })
    tree.add(placeholderPath)
    pendingCreatePathRef.current = canonicalTreePath(placeholderPath)
    tree.startRenaming(placeholderPath, { removeIfCanceled: true })
  }

  function duplicateEntry(treePath: string, isDirectory: boolean) {
    duplicateMutation.mutate({
      from: canonicalTreePath(treePath),
      isFolder: isDirectory,
      to: duplicateTreePath({
        existingPaths: modelRef.current.entriesByTreePath,
        isDirectory,
        treePath,
      }),
    })
  }

  /** Wired into `useFileTree`'s `renaming.onRename`; paths carry no trailing slash. */
  function completeRename(event: FileTreeRenameEvent) {
    const pendingCreatePath = pendingCreatePathRef.current
    pendingCreatePathRef.current = null
    if (pendingCreatePath === event.sourcePath) {
      createMutation.mutate({ isFolder: event.isFolder, treePath: event.destinationPath })
      return
    }

    renameMutation.mutate({
      from: event.sourcePath,
      isFolder: event.isFolder,
      to: event.destinationPath,
    })
  }

  function confirmDelete() {
    if (!deleteTarget) return

    deleteMutation.mutate(deleteTarget)
  }

  const actions: TreeFsActions = {
    createEntry,
    duplicateEntry,
    renameEntry: (rowPath) => void treeRef.current?.startRenaming(rowPath),
    requestDelete: (target) => setDeleteTarget(target),
  }

  return {
    actions,
    completeRename,
    resumeDeferredCreate,
    deleteDialog: {
      deleting: deleteMutation.isPending,
      error: deleteMutation.error ? errorMessage(deleteMutation.error) : null,
      onCancel: () => setDeleteTarget(null),
      onConfirm: confirmDelete,
      target: deleteTarget,
    },
  }
}

function createEntryOnDisk(rootPath: string, request: CreateRequest) {
  const path = workspacePathForTreePath(rootPath, request.treePath)
  if (request.isFolder) return ensureFolderPath(path)

  return createFileContent(path, '')
}

/** The tree keeps directory rows keyed with a trailing slash; files without. */
function rowPathForEntry(treePath: string, isFolder: boolean) {
  return isFolder ? `${treePath}/` : treePath
}
