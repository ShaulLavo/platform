import type { PickedFsEntry } from "@/lib/file-system-types"
import { FilesystemConflictToast } from "@/features/editor/components/filesystem-conflict-toast"
import {
  conflictDiffDocumentId,
  parseConflictDiffDocumentId,
} from "@/features/editor/conflict-diff-document"
import { useEditorCommands } from "@/features/editor/state/editor-commands"
import {
  useEditorConflictStoreApi,
  type EditorConflictStoreApi,
  type FilesystemConflict,
} from "@/features/editor/state/editor-conflict-state"
import {
  useEditorDocumentState,
  type CachedEditorDocument,
} from "@/features/editor/state/editor-document-state"
import { useEditorWorkspaceState } from "@/features/editor/state/editor-workspace-state"
import { reportError, toClientError } from "@/lib/client-error-taxonomy"
import {
  createFileContent,
  ensureFolderPath,
  fetchFile,
  fetchTree,
  writeFileContent,
} from "@/lib/file-server"
import type { FileResult } from "@/lib/file-system-types"
import { fsServerUrl } from "@/lib/fs-client"
import { parseDiffDocumentId } from "@/features/git/diff-document"
import { fileSystemKeys, gitKeys } from "@/lib/query-keys"
import { parseSseStream } from "@/lib/sse"
import { toTreePath } from "@/lib/path-formatters"
import { affectedOpenFileRefreshPaths } from "@/lib/workspace-event-model"
import {
  patchTreeEntryMetadata,
  replaceDirectoryLoad,
  type TreeModel,
} from "@/lib/tree-model"
import { useQueryClient } from "@tanstack/react-query"
import { createMergeConflictDocumentText } from "@editor/core"
import { createElement, useEffect, useEffectEvent } from "react"
import { toast } from "sonner"
import type { WatchServerMessage } from "@workspace/contracts"

export type { WatchServerMessage }

export type FilesystemEvent = Extract<
  WatchServerMessage,
  { type: "created" | "changed" | "deleted" | "renamed" }
>

const EVENT_BATCH_DELAY_MS = 100

const FILE_REFRESH_RETRY_DELAY_MS = 80

const FILE_REFRESH_RETRY_ATTEMPTS = 5

const READY_ROOT_TREE_FRESH_MS = 10_000

export function useWorkspaceEvents(rootFolder: PickedFsEntry | null) {
  const conflictStore = useEditorConflictStoreApi()
  const queryClient = useQueryClient()
  const dirtyFilePaths = useEditorDocumentState((state) => state.dirtyFilePaths)
  const forceReplaceCachedEditorDocument = useEditorDocumentState(
    (state) => state.forceReplaceCachedEditorDocument
  )
  const getCachedEditorDocument = useEditorDocumentState(
    (state) => state.getCachedEditorDocument
  )
  const ensureCachedEditorDocument = useEditorDocumentState(
    (state) => state.ensureCachedEditorDocument
  )
  const openFilePaths = useEditorWorkspaceState((state) => state.openFilePaths)
  const selectedFilePath = useEditorWorkspaceState(
    (state) => state.selectedFilePath
  )
  const {
    closeTab,
    discardCachedEditorDocument,
    renameCachedEditorDocument,
    selectFile,
  } = useEditorCommands()
  const rootPath = rootFolder?.path ?? null
  const forceReplaceSelectedDocument = (file: FileResult) =>
    forceReplaceCachedEditorDocument(file, selectedFilePath)
  const applyEvents = useEffectEvent(
    (
      events: FilesystemEvent[],
      signal: AbortSignal,
      currentRootPath: string
    ) => {
      void applyWorkspaceEvents({
        closeTab,
        conflictStore,
        discardCachedEditorDocument,
        dirtyFilePaths,
        ensureCachedEditorDocument,
        events,
        forceReplaceCachedEditorDocument: forceReplaceSelectedDocument,
        getCachedEditorDocument,
        openFilePaths,
        queryClient,
        renameCachedEditorDocument,
        rootPath: currentRootPath,
        selectFile,
        signal,
      }).catch((error: unknown) => {
        if (signal.aborted) return

        reportError(toClientError(error))
      })
    }
  )
  const applyReady = useEffectEvent(
    (signal: AbortSignal, currentRootPath: string) => {
      const refreshPaths = openFilePaths.filter(
        (path) => !dirtyFilePaths.has(path)
      )

      void applyWorkspaceReady({
        forceReplaceCachedEditorDocument: forceReplaceSelectedDocument,
        openFilePaths: refreshPaths,
        queryClient,
        rootPath: currentRootPath,
        signal,
      }).catch((error: unknown) => {
        if (signal.aborted) return

        reportError(toClientError(error))
      })
    }
  )

  useEffect(() => {
    if (!rootPath) return

    const controller = new AbortController()
    const queue = createEventQueue((events) =>
      applyEvents(events, controller.signal, rootPath)
    )

    void streamWorkspaceEvents(rootPath, controller.signal, (message) => {
      if (message.type === "ready") {
        applyReady(controller.signal, rootPath)
        return
      }
      if (message.type === "error") {
        reportError(toClientError(message))
        return
      }
      if (
        message.type === "subscribed" ||
        message.type === "unsubscribed" ||
        message.type === "pong"
      ) {
        return
      }

      queue.push(message)
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return

      reportError(toClientError(error))
    })

    return () => {
      controller.abort()
      queue.clear()
    }
  }, [rootPath])

  useEffect(() => {
    return () => dismissFilesystemConflicts(conflictStore)
  }, [conflictStore, rootPath])
}

async function applyWorkspaceEvents({
  closeTab,
  conflictStore,
  discardCachedEditorDocument,
  dirtyFilePaths,
  ensureCachedEditorDocument,
  events,
  forceReplaceCachedEditorDocument,
  getCachedEditorDocument,
  openFilePaths,
  queryClient,
  renameCachedEditorDocument,
  rootPath,
  selectFile,
  signal,
}: {
  closeTab: (path: string) => void
  conflictStore: EditorConflictStoreApi
  discardCachedEditorDocument: (path: string) => { wasDirty: boolean }
  dirtyFilePaths: ReadonlySet<string>
  ensureCachedEditorDocument: (file: FileResult) => CachedEditorDocument
  events: FilesystemEvent[]
  forceReplaceCachedEditorDocument: (file: FileResult) => { wasDirty: boolean }
  getCachedEditorDocument: (path: string) => CachedEditorDocument | null
  openFilePaths: readonly string[]
  queryClient: ReturnType<typeof useQueryClient>
  renameCachedEditorDocument: (
    from: string,
    to: string
  ) => { wasDirty: boolean }
  rootPath: string
  selectFile: (path: string | null) => void
  signal: AbortSignal
}) {
  invalidateGitState(queryClient)
  patchChangedTreeEntries(queryClient, rootPath, events)
  await refreshAffectedTreeDirectories(queryClient, rootPath, events, signal)
  await refreshAffectedOpenFiles({
    closeTab,
    conflictStore,
    discardCachedEditorDocument,
    dirtyFilePaths,
    ensureCachedEditorDocument,
    events,
    forceReplaceCachedEditorDocument,
    getCachedEditorDocument,
    openFilePaths,
    queryClient,
    renameCachedEditorDocument,
    rootPath,
    selectFile,
    signal,
  })
}

function patchChangedTreeEntries(
  queryClient: ReturnType<typeof useQueryClient>,
  rootPath: string,
  events: readonly FilesystemEvent[]
) {
  const entries = events.flatMap((event) =>
    event.type === "changed" && event.entry ? [event.entry] : []
  )
  if (!entries.length) return

  const rootTreeKey = fileSystemKeys.tree(rootPath)
  queryClient.setQueryData(rootTreeKey, (current: TreeModel | undefined) => {
    if (!current) return current

    return entries.reduce(
      (model, entry) => patchTreeEntryMetadata(model, rootPath, entry),
      current
    )
  })
}

function invalidateGitState(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: gitKeys.all })
}

async function applyWorkspaceReady({
  forceReplaceCachedEditorDocument,
  openFilePaths,
  queryClient,
  rootPath,
  signal,
}: {
  forceReplaceCachedEditorDocument: (file: FileResult) => { wasDirty: boolean }
  openFilePaths: readonly string[]
  queryClient: ReturnType<typeof useQueryClient>
  rootPath: string
  signal: AbortSignal
}) {
  invalidateGitState(queryClient)
  await refreshReadyRootTreeDirectory(queryClient, rootPath, signal)

  await Promise.all(
    fileBackedOpenPaths(openFilePaths).map((path) =>
      refreshCleanOpenFile(
        queryClient,
        path,
        forceReplaceCachedEditorDocument,
        signal
      ).catch(() => undefined)
    )
  )
}

async function refreshReadyRootTreeDirectory(
  queryClient: ReturnType<typeof useQueryClient>,
  rootPath: string,
  signal: AbortSignal
) {
  if (!shouldRefreshReadyRootTree(queryClient, rootPath)) return

  await refreshTreeDirectory(queryClient, rootPath, rootPath, signal).catch(
    () => null
  )
}

export function shouldRefreshReadyRootTree(
  queryClient: {
    getQueryState: (queryKey: readonly unknown[]) =>
      | {
          data?: unknown
          dataUpdatedAt: number
          fetchStatus: string
          isInvalidated?: boolean
        }
      | undefined
  },
  rootPath: string,
  now = Date.now()
) {
  const state = queryClient.getQueryState(fileSystemKeys.tree(rootPath))
  if (!state) return false
  if (state.fetchStatus === "fetching") return false
  if (!state.data) return false
  if (state.isInvalidated) return true

  return now - state.dataUpdatedAt > READY_ROOT_TREE_FRESH_MS
}

async function refreshAffectedTreeDirectories(
  queryClient: ReturnType<typeof useQueryClient>,
  rootPath: string,
  events: readonly FilesystemEvent[],
  signal: AbortSignal
) {
  const directories = affectedDirectoryPaths(events, rootPath)

  await Promise.all(
    [...directories].map((path) =>
      refreshTreeDirectory(queryClient, rootPath, path, signal).catch(
        () => null
      )
    )
  )
}

async function refreshTreeDirectory(
  queryClient: ReturnType<typeof useQueryClient>,
  rootPath: string,
  path: string,
  signal: AbortSignal
) {
  const rootTreeKey = fileSystemKeys.tree(rootPath)
  const model = queryClient.getQueryData<TreeModel>(rootTreeKey)
  if (!model) return
  if (!shouldRefreshDirectory(model, rootPath, path)) return

  const result = await fetchTree(path, signal)
  queryClient.setQueryData(rootTreeKey, (current: TreeModel | undefined) => {
    if (!current) return current

    return replaceDirectoryLoad(current, rootPath, result)
  })
}

async function refreshAffectedOpenFiles({
  closeTab,
  conflictStore,
  discardCachedEditorDocument,
  dirtyFilePaths,
  ensureCachedEditorDocument,
  events,
  forceReplaceCachedEditorDocument,
  getCachedEditorDocument,
  openFilePaths,
  queryClient,
  renameCachedEditorDocument,
  rootPath,
  selectFile,
  signal,
}: {
  closeTab: (path: string) => void
  conflictStore: EditorConflictStoreApi
  discardCachedEditorDocument: (path: string) => { wasDirty: boolean }
  dirtyFilePaths: ReadonlySet<string>
  ensureCachedEditorDocument: (file: FileResult) => CachedEditorDocument
  events: readonly FilesystemEvent[]
  forceReplaceCachedEditorDocument: (file: FileResult) => { wasDirty: boolean }
  getCachedEditorDocument: (path: string) => CachedEditorDocument | null
  openFilePaths: readonly string[]
  queryClient: ReturnType<typeof useQueryClient>
  renameCachedEditorDocument: (
    from: string,
    to: string
  ) => { wasDirty: boolean }
  rootPath: string
  selectFile: (path: string | null) => void
  signal: AbortSignal
}) {
  const conflictContext: ConflictContext = {
    closeTab,
    conflictStore,
    discardCachedEditorDocument,
    ensureCachedEditorDocument,
    forceReplaceCachedEditorDocument,
    getCachedEditorDocument,
    queryClient,
    renameCachedEditorDocument,
    selectFile,
  }
  const recreatedPaths = recreatedOpenFilePaths(events)
  const fileBackedPaths = fileBackedOpenPaths(openFilePaths)
  const refreshPaths = affectedOpenFileRefreshPaths(
    events,
    fileBackedPaths,
    recreatedPaths,
    rootPath
  )
  for (const event of events) {
    if (event.type === "deleted") {
      if (recreatedPaths.has(event.path)) continue

      discardDeletedOpenFiles(
        event.path,
        fileBackedPaths,
        dirtyFilePaths,
        conflictContext,
        discardCachedEditorDocument,
        queryClient
      )
      continue
    }
    if (event.type !== "renamed") continue

    await renameOpenFiles(
      event,
      fileBackedPaths,
      dirtyFilePaths,
      conflictContext,
      renameCachedEditorDocument,
      queryClient
    )
  }

  for (const path of refreshPaths) {
    await refreshChangedOpenFile(
      queryClient,
      path,
      forceReplaceCachedEditorDocument,
      dirtyFilePaths,
      conflictContext,
      signal
    )
  }
}

function fileBackedOpenPaths(openFilePaths: readonly string[]) {
  return openFilePaths.filter(
    (path) => !parseDiffDocumentId(path) && !parseConflictDiffDocumentId(path)
  )
}

function recreatedOpenFilePaths(events: readonly FilesystemEvent[]) {
  const deletedPaths = new Set<string>()
  const recreatedPaths = new Set<string>()

  for (const event of events) {
    if (event.type === "deleted") {
      deletedPaths.add(event.path)
      continue
    }
    if (event.type !== "created" && event.type !== "changed") continue
    if (!deletedPaths.has(event.path)) continue

    recreatedPaths.add(event.path)
  }

  return recreatedPaths
}

async function refreshChangedOpenFile(
  queryClient: ReturnType<typeof useQueryClient>,
  path: string,
  forceReplaceCachedEditorDocument: (file: FileResult) => { wasDirty: boolean },
  dirtyFilePaths: ReadonlySet<string>,
  conflictContext: ConflictContext,
  signal: AbortSignal
) {
  const file = await fetchFileWithRetry(path, signal)
  queryClient.setQueryData(fileSystemKeys.file(path), file)
  if (isDirtyCachedDocument(path, dirtyFilePaths, conflictContext)) {
    notifyFilesystemConflict(
      changedConflict(path, file, conflictContext),
      conflictContext
    )
    return
  }

  const result = forceReplaceCachedEditorDocument(file)
  if (result.wasDirty) notifyDirtyOverwrite(path)
}

async function refreshCleanOpenFile(
  queryClient: ReturnType<typeof useQueryClient>,
  path: string,
  forceReplaceCachedEditorDocument: (file: FileResult) => { wasDirty: boolean },
  signal: AbortSignal
) {
  const file = await fetchFileWithRetry(path, signal)
  queryClient.setQueryData(fileSystemKeys.file(path), file)

  const result = forceReplaceCachedEditorDocument(file)
  if (result.wasDirty) notifyDirtyOverwrite(path)
}

async function fetchFileWithRetry(path: string, signal: AbortSignal) {
  let lastError: unknown = null

  for (let attempt = 0; attempt < FILE_REFRESH_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await fetchFile(path, signal)
    } catch (error) {
      lastError = error
      if (signal.aborted) throw error
      await delay(FILE_REFRESH_RETRY_DELAY_MS, signal)
    }
  }

  throw lastError
}

type ConflictContext = {
  closeTab: (path: string) => void
  conflictStore: EditorConflictStoreApi
  discardCachedEditorDocument: (path: string) => { wasDirty: boolean }
  ensureCachedEditorDocument: (file: FileResult) => CachedEditorDocument
  forceReplaceCachedEditorDocument: (file: FileResult) => { wasDirty: boolean }
  getCachedEditorDocument: (path: string) => CachedEditorDocument | null
  queryClient: ReturnType<typeof useQueryClient>
  renameCachedEditorDocument: (
    from: string,
    to: string
  ) => { wasDirty: boolean }
  selectFile: (path: string | null) => void
}

let nextConflictId = 0

function isDirtyCachedDocument(
  path: string,
  dirtyFilePaths: ReadonlySet<string>,
  context: ConflictContext
) {
  return (
    dirtyFilePaths.has(path) ||
    context.getCachedEditorDocument(path)?.session.isDirty() === true
  )
}

function changedConflict(
  path: string,
  remoteFile: FileResult,
  context: ConflictContext
): FilesystemConflict {
  return {
    eventType: "changed",
    id: createConflictId(),
    localPath: path,
    localText: localConflictText(path, context),
    remoteMtimeMs: remoteFile.mtimeMs,
    remotePath: path,
    remoteSize: remoteFile.size,
    remoteText: remoteFile.content,
  }
}

function deletedConflict(
  path: string,
  context: ConflictContext
): FilesystemConflict {
  return {
    eventType: "deleted",
    id: createConflictId(),
    localPath: path,
    localText: localConflictText(path, context),
    remoteMtimeMs: null,
    remotePath: path,
    remoteSize: null,
    remoteText: null,
  }
}

async function notifyRenamedFilesystemConflict(
  localPath: string,
  remotePath: string,
  context: ConflictContext
) {
  const remoteFile = await fetchFileWithRetry(
    remotePath,
    new AbortController().signal
  )
  notifyFilesystemConflict(
    {
      eventType: "renamed",
      id: createConflictId(),
      localPath,
      localText: localConflictText(localPath, context),
      remoteMtimeMs: remoteFile.mtimeMs,
      remotePath,
      remoteSize: remoteFile.size,
      remoteText: remoteFile.content,
    },
    context
  )
}

function notifyFilesystemConflict(
  conflict: FilesystemConflict,
  context: ConflictContext
) {
  const current = matchingConflict(conflict, context)
  const next = current ? refreshedConflict(current, conflict) : conflict
  context.conflictStore.getState().addConflict(next)
  if (current?.toastId) return

  const toastId = toast.custom(
    () =>
      createElement(FilesystemConflictToast, {
        conflict: next,
        onOpenDiff: () => openConflictDiff(next.id, context),
        onOverrideLocal: () => void resolveConflict(next.id, "local", context),
        onOverrideRemote: () =>
          void resolveConflict(next.id, "remote", context),
      }),
    { dismissible: false, duration: Infinity }
  )
  context.conflictStore.getState().updateConflict(next.id, { toastId })
}

function matchingConflict(
  conflict: FilesystemConflict,
  context: ConflictContext
) {
  const conflicts = Object.values(context.conflictStore.getState().conflicts)
  return conflicts.find(
    (current) =>
      current.eventType === conflict.eventType &&
      current.localPath === conflict.localPath &&
      current.remotePath === conflict.remotePath
  )
}

function refreshedConflict(
  current: FilesystemConflict,
  next: FilesystemConflict
): FilesystemConflict {
  return {
    ...next,
    diffDocumentId: current.diffDocumentId,
    id: current.id,
    toastId: current.toastId,
  }
}

function openConflictDiff(id: string, context: ConflictContext) {
  const conflict = context.conflictStore.getState().conflicts[id]
  if (!conflict) return

  const documentId = conflict.diffDocumentId ?? conflictDiffDocumentId(id)
  ensureConflictEditorDocument(documentId, conflict, context)
  context.conflictStore
    .getState()
    .updateConflict(id, { diffDocumentId: documentId })
  context.selectFile(documentId)
}

function ensureConflictEditorDocument(
  documentId: string,
  conflict: FilesystemConflict,
  context: ConflictContext
) {
  if (context.getCachedEditorDocument(documentId)) return

  const content = createMergeConflictDocumentText(conflict)
  context.ensureCachedEditorDocument({
    content,
    mtimeMs: Date.now(),
    path: documentId,
    size: content.length,
  })
}

async function resolveConflict(
  id: string,
  resolution: "local" | "remote",
  context: ConflictContext
) {
  const conflict = context.conflictStore.getState().conflicts[id]
  if (!conflict) return

  try {
    if (resolution === "local") await applyLocalConflict(conflict, context)
    if (resolution === "remote") await applyRemoteConflict(conflict, context)
    finishConflict(conflict, context)
  } catch (error) {
    reportError(toClientError(error))
  }
}

async function applyLocalConflict(
  conflict: FilesystemConflict,
  context: ConflictContext
) {
  if (conflict.eventType === "deleted") {
    await restoreDeletedLocalConflict(conflict)
  } else {
    await writeFileContent(
      conflict.remotePath,
      conflict.localText,
      conflict.remoteMtimeMs
    )
  }

  const file = await fetchFileWithRetry(
    conflict.remotePath,
    new AbortController().signal
  )
  replaceResolvedEditorFile(conflict.localPath, file, context)
}

async function restoreDeletedLocalConflict(conflict: FilesystemConflict) {
  await ensureFolderPath(parentPath(conflict.remotePath, ""))
  await createFileContent(conflict.remotePath, conflict.localText)
}

async function applyRemoteConflict(
  conflict: FilesystemConflict,
  context: ConflictContext
) {
  if (conflict.remoteText === null) {
    discardResolvedEditorFile(conflict.localPath, context)
    return
  }

  replaceResolvedEditorFile(
    conflict.localPath,
    remoteFileResult(conflict),
    context
  )
}

function replaceResolvedEditorFile(
  localPath: string,
  file: FileResult,
  context: ConflictContext
) {
  if (localPath !== file.path) {
    context.renameCachedEditorDocument(localPath, file.path)
    moveFileQueryData(context.queryClient, localPath, file.path)
  }

  context.queryClient.setQueryData(fileSystemKeys.file(file.path), file)
  context.forceReplaceCachedEditorDocument(file)
}

function discardResolvedEditorFile(path: string, context: ConflictContext) {
  context.discardCachedEditorDocument(path)
  context.queryClient.removeQueries({
    exact: true,
    queryKey: fileSystemKeys.file(path),
  })
}

function finishConflict(
  conflict: FilesystemConflict,
  context: ConflictContext
) {
  if (conflict.diffDocumentId) {
    context.discardCachedEditorDocument(conflict.diffDocumentId)
  }
  if (conflict.toastId) toast.dismiss(conflict.toastId)

  context.conflictStore.getState().removeConflict(conflict.id)
}

function dismissFilesystemConflicts(conflictStore: EditorConflictStoreApi) {
  for (const conflict of Object.values(conflictStore.getState().conflicts)) {
    if (conflict.toastId) toast.dismiss(conflict.toastId)
  }

  conflictStore.getState().clearConflicts()
}

function remoteFileResult(conflict: FilesystemConflict): FileResult {
  return {
    content: conflict.remoteText ?? "",
    mtimeMs: conflict.remoteMtimeMs ?? Date.now(),
    path: conflict.remotePath,
    size: conflict.remoteSize ?? conflict.remoteText?.length ?? 0,
  }
}

function localConflictText(path: string, context: ConflictContext) {
  return context.getCachedEditorDocument(path)?.session.getText() ?? ""
}

function createConflictId() {
  nextConflictId += 1
  return `${Date.now().toString(36)}-${nextConflictId.toString(36)}`
}

function discardDeletedOpenFiles(
  path: string,
  openFilePaths: readonly string[],
  dirtyFilePaths: ReadonlySet<string>,
  conflictContext: ConflictContext,
  discardCachedEditorDocument: (path: string) => { wasDirty: boolean },
  queryClient: ReturnType<typeof useQueryClient>
) {
  for (const openPath of openFilePaths) {
    if (!isSameOrChildPath(openPath, path)) continue
    if (isDirtyCachedDocument(openPath, dirtyFilePaths, conflictContext)) {
      notifyFilesystemConflict(
        deletedConflict(openPath, conflictContext),
        conflictContext
      )
      continue
    }

    const result = discardCachedEditorDocument(openPath)
    queryClient.removeQueries({
      exact: true,
      queryKey: fileSystemKeys.file(openPath),
    })
    if (result.wasDirty) notifyDirtyOverwrite(openPath)
  }
}

async function renameOpenFiles(
  event: Extract<FilesystemEvent, { type: "renamed" }>,
  openFilePaths: readonly string[],
  dirtyFilePaths: ReadonlySet<string>,
  conflictContext: ConflictContext,
  renameCachedEditorDocument: (
    from: string,
    to: string
  ) => { wasDirty: boolean },
  queryClient: ReturnType<typeof useQueryClient>
) {
  for (const openPath of openFilePaths) {
    const nextPath = renamedPath(openPath, event.oldPath, event.path)
    if (!nextPath) continue
    if (isDirtyCachedDocument(openPath, dirtyFilePaths, conflictContext)) {
      await notifyRenamedFilesystemConflict(openPath, nextPath, conflictContext)
      continue
    }

    const result = renameCachedEditorDocument(openPath, nextPath)
    moveFileQueryData(queryClient, openPath, nextPath)
    if (result.wasDirty) notifyDirtyOverwrite(openPath)
  }
}

function moveFileQueryData(
  queryClient: ReturnType<typeof useQueryClient>,
  from: string,
  to: string
) {
  const file = queryClient.getQueryData<FileResult>(fileSystemKeys.file(from))
  queryClient.removeQueries({
    exact: true,
    queryKey: fileSystemKeys.file(from),
  })
  if (!file) return

  queryClient.setQueryData(fileSystemKeys.file(to), { ...file, path: to })
}

function shouldRefreshDirectory(
  model: TreeModel,
  rootPath: string,
  path: string
) {
  if (path === rootPath) return true

  const treePath = toTreePath(path, rootPath)
  return model.loadedDirectoryPaths.has(treePath)
}

function affectedDirectoryPaths(
  events: readonly FilesystemEvent[],
  rootPath: string
) {
  const directories = new Set<string>()

  for (const event of events) {
    if (event.type === "changed") continue

    directories.add(parentPath(event.path, rootPath))
    if (event.type === "renamed")
      directories.add(parentPath(event.oldPath, rootPath))
  }

  return directories
}

function parentPath(path: string, rootPath: string) {
  if (path === rootPath) return rootPath

  const index = path.lastIndexOf("/")
  if (index < 0) return rootPath

  return path.slice(0, index)
}

async function streamWorkspaceEvents(
  rootPath: string,
  signal: AbortSignal,
  onMessage: (message: WatchServerMessage) => void
) {
  const response = await fetch(workspaceEventsUrl(rootPath), { signal })
  if (!response.ok)
    throw new Error(`File watcher failed with status ${response.status}`)
  if (!response.body)
    throw new Error("File watcher response did not include a body.")

  for await (const event of parseSseStream(response.body)) {
    const message = watchServerMessage(event.data)
    if (!message) continue

    onMessage(message)
  }
}

function workspaceEventsUrl(rootPath: string) {
  const url = new URL("/fs/events", fsServerUrl)
  url.searchParams.set("path", rootPath)
  return url
}

function watchServerMessage(data: unknown): WatchServerMessage | null {
  if (!data || typeof data !== "object") return null
  if (!("type" in data) || typeof data.type !== "string") return null
  if (data.type === "ready" && hasString(data, "root")) {
    return data as WatchServerMessage
  }
  if (
    data.type === "error" &&
    hasString(data, "code") &&
    hasString(data, "message")
  ) {
    return data as WatchServerMessage
  }
  if (isBasicFilesystemMessage(data)) return data
  if (
    data.type === "renamed" &&
    hasString(data, "path") &&
    hasString(data, "oldPath")
  ) {
    return data as WatchServerMessage
  }

  return null
}

function isBasicFilesystemMessage(
  data: object
): data is Extract<
  FilesystemEvent,
  { type: "created" | "changed" | "deleted" }
> {
  if (!("type" in data) || !("path" in data)) return false
  if (typeof data.path !== "string") return false

  return (
    data.type === "created" ||
    data.type === "changed" ||
    data.type === "deleted"
  )
}

function hasString<T extends string>(
  value: object,
  key: T
): value is object & Record<T, string> {
  return typeof (value as Record<string, unknown>)[key] === "string"
}

function createEventQueue(onFlush: (events: FilesystemEvent[]) => void) {
  let queued: FilesystemEvent[] = []
  let timeout: number | null = null

  return {
    clear: () => {
      queued = []
      if (timeout === null) return

      window.clearTimeout(timeout)
      timeout = null
    },
    push: (event: FilesystemEvent) => {
      queued.push(event)
      if (timeout !== null) return

      timeout = window.setTimeout(() => {
        const events = queued
        queued = []
        timeout = null
        onFlush(events)
      }, EVENT_BATCH_DELAY_MS)
    },
  }
}

function renamedPath(path: string, from: string, to: string) {
  if (path === from) return to
  if (!path.startsWith(`${from}/`)) return null

  return `${to}${path.slice(from.length)}`
}

function isSameOrChildPath(path: string, parent: string) {
  return path === parent || path.startsWith(`${parent}/`)
}

function notifyDirtyOverwrite(path: string) {
  // TODO(conflicts): Replace overwrite behavior with conflict resolution state/view.
  toast.error("Local edits were overwritten", {
    description: `${path} changed on disk. The remote version replaced your unsaved local edits.`,
  })
}

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(resolve, ms)
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeout)
        reject(new DOMException("Aborted", "AbortError"))
      },
      { once: true }
    )
  })
}
