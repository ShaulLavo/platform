import { FilesystemConflictToast } from '@/features/editor/components/filesystem-conflict-toast'
import { conflictDiffDocumentId } from '@/features/editor/conflict-diff-document'
import type {
  EditorConflictStoreApi,
  FilesystemConflict,
} from '@/features/editor/state/editor-conflict-state'
import type { CachedEditorDocument } from '@/features/editor/state/editor-document-state'
import { reportError, toClientError } from '@/lib/client-error-taxonomy'
import { setFileContentQueryData } from '@/lib/file-query-cache'
import { createFileContent, ensureFolderPath, writeFileContent } from '@/lib/file-server'
import type { FileResult } from '@/lib/file-system-types'
import { fileSystemKeys } from '@/lib/query-keys'
import { createMergeConflictDocumentText } from '@editor/core'
import type { QueryClient } from '@tanstack/react-query'
import { createElement } from 'react'
import { toast } from 'sonner'

export type WorkspaceConflictContext = {
  conflictStore: EditorConflictStoreApi
  discardCachedEditorDocument: (path: string) => { wasDirty: boolean }
  ensureCachedEditorDocument: (file: FileResult) => CachedEditorDocument
  fetchFile: (path: string, signal: AbortSignal) => Promise<FileResult>
  forceReplaceCachedEditorDocument: (file: FileResult) => { wasDirty: boolean }
  getCachedEditorDocument: (path: string) => CachedEditorDocument | null
  queryClient: QueryClient
  renameCachedEditorDocument: (from: string, to: string) => { wasDirty: boolean }
  selectFile: (path: string | null) => void
}

let nextConflictId = 0

export function notifyChangedFilesystemConflict(
  path: string,
  remoteFile: FileResult,
  context: WorkspaceConflictContext,
) {
  notifyFilesystemConflict(changedConflict(path, remoteFile, context), context)
}

export function notifyDeletedFilesystemConflict(path: string, context: WorkspaceConflictContext) {
  notifyFilesystemConflict(deletedConflict(path, context), context)
}

export async function notifyRenamedFilesystemConflict(
  localPath: string,
  remotePath: string,
  context: WorkspaceConflictContext,
) {
  const remoteFile = await context.fetchFile(remotePath, new AbortController().signal)
  notifyFilesystemConflict(
    {
      eventType: 'renamed',
      id: createConflictId(),
      localPath,
      localText: localConflictText(localPath, context),
      remoteMtimeMs: remoteFile.mtimeMs,
      remotePath,
      remoteSize: remoteFile.size,
      remoteText: remoteFile.content,
      remoteVersion: remoteFile.version,
    },
    context,
  )
}

export function dismissFilesystemConflicts(conflictStore: EditorConflictStoreApi) {
  for (const conflict of Object.values(conflictStore.getState().conflicts)) {
    if (conflict.toastId) toast.dismiss(conflict.toastId)
  }

  conflictStore.getState().clearConflicts()
}

function changedConflict(
  path: string,
  remoteFile: FileResult,
  context: WorkspaceConflictContext,
): FilesystemConflict {
  return {
    eventType: 'changed',
    id: createConflictId(),
    localPath: path,
    localText: localConflictText(path, context),
    remoteMtimeMs: remoteFile.mtimeMs,
    remotePath: path,
    remoteSize: remoteFile.size,
    remoteText: remoteFile.content,
    remoteVersion: remoteFile.version,
  }
}

function deletedConflict(path: string, context: WorkspaceConflictContext): FilesystemConflict {
  return {
    eventType: 'deleted',
    id: createConflictId(),
    localPath: path,
    localText: localConflictText(path, context),
    remoteMtimeMs: null,
    remotePath: path,
    remoteSize: null,
    remoteText: null,
    remoteVersion: null,
  }
}

function notifyFilesystemConflict(conflict: FilesystemConflict, context: WorkspaceConflictContext) {
  const current = matchingConflict(conflict, context)
  const next = current ? refreshedConflict(current, conflict) : conflict
  context.conflictStore.getState().addConflict(next)
  if (current?.toastId) return

  const toastId = toast.custom(
    () =>
      createElement(FilesystemConflictToast, {
        conflict: next,
        onOpenDiff: () => openConflictDiff(next.id, context),
        onOverrideLocal: () => void resolveConflict(next.id, 'local', context),
        onOverrideRemote: () => void resolveConflict(next.id, 'remote', context),
      }),
    { dismissible: false, duration: Infinity },
  )
  context.conflictStore.getState().updateConflict(next.id, { toastId })
}

function matchingConflict(conflict: FilesystemConflict, context: WorkspaceConflictContext) {
  const conflicts = Object.values(context.conflictStore.getState().conflicts)
  return conflicts.find(
    (current) =>
      current.eventType === conflict.eventType &&
      current.localPath === conflict.localPath &&
      current.remotePath === conflict.remotePath,
  )
}

function refreshedConflict(
  current: FilesystemConflict,
  next: FilesystemConflict,
): FilesystemConflict {
  return {
    ...next,
    diffDocumentId: current.diffDocumentId,
    id: current.id,
    toastId: current.toastId,
  }
}

function openConflictDiff(id: string, context: WorkspaceConflictContext) {
  const conflict = context.conflictStore.getState().conflicts[id]
  if (!conflict) return

  const documentId = conflict.diffDocumentId ?? conflictDiffDocumentId(id)
  ensureConflictEditorDocument(documentId, conflict, context)
  context.conflictStore.getState().updateConflict(id, { diffDocumentId: documentId })
  context.selectFile(documentId)
}

function ensureConflictEditorDocument(
  documentId: string,
  conflict: FilesystemConflict,
  context: WorkspaceConflictContext,
) {
  if (context.getCachedEditorDocument(documentId)) return

  const content = createMergeConflictDocumentText(conflict)
  const mtimeMs = Date.now()
  context.ensureCachedEditorDocument({
    content,
    mtimeMs,
    path: documentId,
    size: content.length,
    version: syntheticFileVersion(mtimeMs, content.length),
  })
}

async function resolveConflict(
  id: string,
  resolution: 'local' | 'remote',
  context: WorkspaceConflictContext,
) {
  const conflict = context.conflictStore.getState().conflicts[id]
  if (!conflict) return

  try {
    if (resolution === 'local') await applyLocalConflict(conflict, context)
    if (resolution === 'remote') await applyRemoteConflict(conflict, context)
    finishConflict(conflict, context)
  } catch (error) {
    reportError(toClientError(error))
  }
}

async function applyLocalConflict(conflict: FilesystemConflict, context: WorkspaceConflictContext) {
  if (conflict.eventType === 'deleted') {
    await restoreDeletedLocalConflict(conflict)
  } else {
    await writeFileContent(conflict.remotePath, conflict.localText, {
      baseVersion: conflict.remoteVersion,
      expectedMtimeMs: conflict.remoteMtimeMs,
      origin: 'conflict-resolution',
    })
  }

  const file = await context.fetchFile(conflict.remotePath, new AbortController().signal)
  replaceResolvedEditorFile(conflict.localPath, file, context)
}

async function restoreDeletedLocalConflict(conflict: FilesystemConflict) {
  await ensureFolderPath(parentPath(conflict.remotePath, ''))
  await createFileContent(conflict.remotePath, conflict.localText)
}

async function applyRemoteConflict(
  conflict: FilesystemConflict,
  context: WorkspaceConflictContext,
) {
  if (conflict.remoteText === null) {
    discardResolvedEditorFile(conflict.localPath, context)
    return
  }

  replaceResolvedEditorFile(conflict.localPath, remoteFileResult(conflict), context)
}

function replaceResolvedEditorFile(
  localPath: string,
  file: FileResult,
  context: WorkspaceConflictContext,
) {
  if (localPath !== file.path) {
    context.renameCachedEditorDocument(localPath, file.path)
    moveFileQueryData(context.queryClient, localPath, file.path)
  }

  setFileContentQueryData(context.queryClient, file)
  context.forceReplaceCachedEditorDocument(file)
}

function discardResolvedEditorFile(path: string, context: WorkspaceConflictContext) {
  context.discardCachedEditorDocument(path)
  context.queryClient.removeQueries({
    exact: true,
    queryKey: fileSystemKeys.file(path),
  })
}

function finishConflict(conflict: FilesystemConflict, context: WorkspaceConflictContext) {
  if (conflict.diffDocumentId) {
    context.discardCachedEditorDocument(conflict.diffDocumentId)
  }
  if (conflict.toastId) toast.dismiss(conflict.toastId)

  context.conflictStore.getState().removeConflict(conflict.id)
}

function remoteFileResult(conflict: FilesystemConflict): FileResult {
  return {
    content: conflict.remoteText ?? '',
    mtimeMs: conflict.remoteMtimeMs ?? Date.now(),
    path: conflict.remotePath,
    size: conflict.remoteSize ?? conflict.remoteText?.length ?? 0,
    version:
      conflict.remoteVersion ??
      syntheticFileVersion(conflict.remoteMtimeMs ?? Date.now(), conflict.remoteSize ?? 0),
  }
}

function localConflictText(path: string, context: WorkspaceConflictContext) {
  return context.getCachedEditorDocument(path)?.session.materializeFullText() ?? ''
}

function createConflictId() {
  nextConflictId += 1
  return `${Date.now().toString(36)}-${nextConflictId.toString(36)}`
}

function syntheticFileVersion(mtimeMs: number, size: number) {
  return `synthetic:${mtimeMs}:${size}`
}

function moveFileQueryData(queryClient: QueryClient, from: string, to: string) {
  const file = queryClient.getQueryData<FileResult>(fileSystemKeys.file(from))
  queryClient.removeQueries({
    exact: true,
    queryKey: fileSystemKeys.file(from),
  })
  if (!file) return

  setFileContentQueryData(queryClient, { ...file, path: to })
}

function parentPath(path: string, rootPath: string) {
  if (path === rootPath) return rootPath

  const index = path.lastIndexOf('/')
  if (index < 0) return rootPath

  return path.slice(0, index)
}
