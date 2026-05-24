import type { PickedFsEntry } from "@/lib/file-system-types"
import { parseConflictDiffDocumentId } from "@/features/editor/conflict-diff-document"
import { useEditorCommands } from "@/features/editor/state/editor-commands"
import {
  useEditorConflictStoreApi,
  type EditorConflictStoreApi,
} from "@/features/editor/state/editor-conflict-state"
import {
  useEditorDocumentState,
  type CachedEditorDocument,
} from "@/features/editor/state/editor-document-state"
import { useEditorWorkspaceState } from "@/features/editor/state/editor-workspace-state"
import { reportError, toClientError } from "@/lib/client-error-taxonomy"
import { fetchFile, fetchTree } from "@/lib/file-server"
import type { FileResult } from "@/lib/file-system-types"
import { fsClient } from "@/lib/fs-client"
import { parseDiffDocumentId } from "@/features/git/diff-document"
import { parseSearchBufferDocumentId } from "@/features/search/search-buffer-document"
import { fileSystemKeys, gitKeys } from "@/lib/query-keys"
import { parseEdenSseStream } from "@/lib/eden-events"
import { toTreePath } from "@/lib/path-formatters"
import {
  planFetchedOpenFileRefresh,
  planWorkspaceFilesystemEvents,
  planWorkspaceReady,
  type WorkspaceEventPlan,
  type WorkspaceFetchedOpenFileOperation,
  type WorkspaceOpenFileOperation,
  type WorkspaceOpenFileSnapshot,
  type WorkspaceTreeOperation,
} from "@/lib/workspace-event-model"
import {
  dismissFilesystemConflicts,
  notifyChangedFilesystemConflict,
  notifyDeletedFilesystemConflict,
  notifyRenamedFilesystemConflict,
  type WorkspaceConflictContext,
} from "@/hooks/workspace-event-conflict-adapter"
import {
  patchTreeEntryMetadata,
  replaceDirectoryLoad,
  type TreeModel,
} from "@/lib/tree-model"
import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useEffectEvent } from "react"
import { toast } from "sonner"
import type { TreeEntry, WatchServerMessage } from "@workspace/contracts"

export type { WatchServerMessage }

export { affectedDirectoryPaths } from "@/lib/workspace-event-model"

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
      void applyWorkspaceReady({
        conflictStore,
        discardCachedEditorDocument,
        dirtyFilePaths,
        ensureCachedEditorDocument,
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
  const plan = planWorkspaceFilesystemEvents({
    events,
    openFiles: openFileSnapshots(
      openFilePaths,
      dirtyFilePaths,
      getCachedEditorDocument
    ),
    rootPath,
  })

  await applyWorkspaceEventPlan({
    conflictStore,
    discardCachedEditorDocument,
    dirtyFilePaths,
    ensureCachedEditorDocument,
    forceReplaceCachedEditorDocument,
    getCachedEditorDocument,
    plan,
    queryClient,
    renameCachedEditorDocument,
    rootPath,
    selectFile,
    signal,
  })
}

function invalidateGitState(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: gitKeys.all })
}

async function applyWorkspaceReady({
  conflictStore,
  discardCachedEditorDocument,
  dirtyFilePaths,
  ensureCachedEditorDocument,
  forceReplaceCachedEditorDocument,
  getCachedEditorDocument,
  openFilePaths,
  queryClient,
  renameCachedEditorDocument,
  rootPath,
  selectFile,
  signal,
}: {
  conflictStore: EditorConflictStoreApi
  discardCachedEditorDocument: (path: string) => { wasDirty: boolean }
  dirtyFilePaths: ReadonlySet<string>
  ensureCachedEditorDocument: (file: FileResult) => CachedEditorDocument
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
  const plan = planWorkspaceReady({
    openFiles: openFileSnapshots(
      openFilePaths,
      dirtyFilePaths,
      getCachedEditorDocument
    ),
    rootPath,
  })

  await applyWorkspaceEventPlan({
    conflictStore,
    discardCachedEditorDocument,
    dirtyFilePaths,
    ensureCachedEditorDocument,
    forceReplaceCachedEditorDocument,
    getCachedEditorDocument,
    ignoreOpenFileRefreshErrors: true,
    plan,
    queryClient,
    renameCachedEditorDocument,
    rootPath,
    selectFile,
    signal,
  })
}

async function applyWorkspaceEventPlan({
  conflictStore,
  discardCachedEditorDocument,
  dirtyFilePaths,
  ensureCachedEditorDocument,
  forceReplaceCachedEditorDocument,
  getCachedEditorDocument,
  ignoreOpenFileRefreshErrors = false,
  plan,
  queryClient,
  renameCachedEditorDocument,
  rootPath,
  selectFile,
  signal,
}: {
  conflictStore: EditorConflictStoreApi
  discardCachedEditorDocument: (path: string) => { wasDirty: boolean }
  dirtyFilePaths: ReadonlySet<string>
  ensureCachedEditorDocument: (file: FileResult) => CachedEditorDocument
  forceReplaceCachedEditorDocument: (file: FileResult) => { wasDirty: boolean }
  getCachedEditorDocument: (path: string) => CachedEditorDocument | null
  ignoreOpenFileRefreshErrors?: boolean
  plan: WorkspaceEventPlan
  queryClient: ReturnType<typeof useQueryClient>
  renameCachedEditorDocument: (
    from: string,
    to: string
  ) => { wasDirty: boolean }
  rootPath: string
  selectFile: (path: string | null) => void
  signal: AbortSignal
}) {
  const conflictContext: WorkspaceConflictContext = {
    conflictStore,
    discardCachedEditorDocument,
    ensureCachedEditorDocument,
    fetchFile: fetchFileWithRetry,
    forceReplaceCachedEditorDocument,
    getCachedEditorDocument,
    queryClient,
    renameCachedEditorDocument,
    selectFile,
  }

  if (plan.shouldInvalidateGitState) invalidateGitState(queryClient)

  await applyTreeOperations(queryClient, rootPath, plan.treeOperations, signal)
  await applyOpenFileOperations({
    conflictContext,
    dirtyFilePaths,
    forceReplaceCachedEditorDocument,
    ignoreRefreshErrors: ignoreOpenFileRefreshErrors,
    operations: plan.openFileOperations,
    queryClient,
    signal,
  })
}

async function applyTreeOperations(
  queryClient: ReturnType<typeof useQueryClient>,
  rootPath: string,
  operations: readonly WorkspaceTreeOperation[],
  signal: AbortSignal
) {
  for (const operation of operations) {
    if (operation.type !== "patch-changed-tree-entries") continue

    patchChangedTreeEntries(queryClient, rootPath, operation.entries)
  }

  await Promise.all(
    operations.map((operation) =>
      applyTreeRefreshOperation(queryClient, rootPath, operation, signal).catch(
        () => null
      )
    )
  )
}

function patchChangedTreeEntries(
  queryClient: ReturnType<typeof useQueryClient>,
  rootPath: string,
  entries: readonly TreeEntry[]
) {
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

async function applyTreeRefreshOperation(
  queryClient: ReturnType<typeof useQueryClient>,
  rootPath: string,
  operation: WorkspaceTreeOperation,
  signal: AbortSignal
) {
  if (operation.type === "refresh-tree-directory") {
    await refreshTreeDirectory(queryClient, rootPath, operation.path, signal)
    return
  }
  if (operation.type !== "refresh-ready-root-tree") return
  if (!shouldRefreshReadyRootTree(queryClient, rootPath)) return

  await refreshTreeDirectory(queryClient, rootPath, operation.path, signal)
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

async function applyOpenFileOperations({
  conflictContext,
  dirtyFilePaths,
  forceReplaceCachedEditorDocument,
  ignoreRefreshErrors,
  operations,
  queryClient,
  signal,
}: {
  conflictContext: WorkspaceConflictContext
  dirtyFilePaths: ReadonlySet<string>
  forceReplaceCachedEditorDocument: (file: FileResult) => { wasDirty: boolean }
  ignoreRefreshErrors: boolean
  operations: readonly WorkspaceOpenFileOperation[]
  queryClient: ReturnType<typeof useQueryClient>
  signal: AbortSignal
}) {
  for (const operation of operations) {
    try {
      await applyOpenFileOperation({
        conflictContext,
        dirtyFilePaths,
        forceReplaceCachedEditorDocument,
        operation,
        queryClient,
        signal,
      })
    } catch (error) {
      if (ignoreRefreshErrors && operation.type === "refresh-open-file")
        continue

      throw error
    }
  }
}

function fileBackedOpenPaths(openFilePaths: readonly string[]) {
  return openFilePaths.filter(
    (path) =>
      !parseDiffDocumentId(path) &&
      !parseConflictDiffDocumentId(path) &&
      !parseSearchBufferDocumentId(path)
  )
}

function openFileSnapshots(
  openFilePaths: readonly string[],
  dirtyFilePaths: ReadonlySet<string>,
  getCachedEditorDocument: (path: string) => CachedEditorDocument | null
): WorkspaceOpenFileSnapshot[] {
  return fileBackedOpenPaths(openFilePaths).map((path) => ({
    isDirty: isDirtyOpenFilePath(path, dirtyFilePaths, getCachedEditorDocument),
    path,
  }))
}

function isDirtyOpenFilePath(
  path: string,
  dirtyFilePaths: ReadonlySet<string>,
  getCachedEditorDocument: (path: string) => CachedEditorDocument | null
) {
  return (
    dirtyFilePaths.has(path) ||
    getCachedEditorDocument(path)?.session.isDirty() === true
  )
}

async function applyOpenFileOperation({
  conflictContext,
  dirtyFilePaths,
  forceReplaceCachedEditorDocument,
  operation,
  queryClient,
  signal,
}: {
  conflictContext: WorkspaceConflictContext
  dirtyFilePaths: ReadonlySet<string>
  forceReplaceCachedEditorDocument: (file: FileResult) => { wasDirty: boolean }
  operation: WorkspaceOpenFileOperation
  queryClient: ReturnType<typeof useQueryClient>
  signal: AbortSignal
}) {
  if (operation.type === "discard-open-file") {
    applyDiscardOpenFileOperation(operation.path, conflictContext)
    return
  }
  if (operation.type === "rename-open-file") {
    applyRenameOpenFileOperation(operation.from, operation.to, conflictContext)
    return
  }
  if (operation.type === "deleted-conflict") {
    applyDeletedConflictOperation(operation.path, conflictContext)
    return
  }
  if (operation.type === "renamed-conflict") {
    await applyRenamedConflictOperation(
      operation.localPath,
      operation.remotePath,
      conflictContext
    )
    return
  }

  await applyRefreshOpenFileOperation({
    conflictContext,
    dirtyFilePaths,
    forceReplaceCachedEditorDocument,
    path: operation.path,
    queryClient,
    signal,
  })
}

async function applyRefreshOpenFileOperation({
  conflictContext,
  dirtyFilePaths,
  forceReplaceCachedEditorDocument,
  path,
  queryClient,
  signal,
}: {
  conflictContext: WorkspaceConflictContext
  dirtyFilePaths: ReadonlySet<string>
  forceReplaceCachedEditorDocument: (file: FileResult) => { wasDirty: boolean }
  path: string
  queryClient: ReturnType<typeof useQueryClient>
  signal: AbortSignal
}) {
  const file = await fetchFileWithRetry(path, signal)
  queryClient.setQueryData(fileSystemKeys.file(path), file)
  const operation = planFetchedOpenFileRefresh({
    cachedText: cachedDocumentText(path, conflictContext),
    isDirty: isDirtyCachedDocument(path, dirtyFilePaths, conflictContext),
    path,
    remoteText: file.content,
  })
  applyFetchedOpenFileOperation(
    operation,
    file,
    forceReplaceCachedEditorDocument,
    conflictContext
  )
}

function applyFetchedOpenFileOperation(
  operation: WorkspaceFetchedOpenFileOperation,
  file: FileResult,
  forceReplaceCachedEditorDocument: (file: FileResult) => { wasDirty: boolean },
  context: WorkspaceConflictContext
) {
  if (operation.type === "changed-conflict") {
    notifyChangedFilesystemConflict(operation.path, file, context)
    return
  }

  const result = forceReplaceCachedEditorDocument(file)
  if (result.wasDirty && operation.notifyDirtyOverwrite)
    notifyDirtyOverwrite(operation.path)
}

function applyDiscardOpenFileOperation(
  path: string,
  context: WorkspaceConflictContext
) {
  const result = context.discardCachedEditorDocument(path)
  context.queryClient.removeQueries({
    exact: true,
    queryKey: fileSystemKeys.file(path),
  })
  if (result.wasDirty) notifyDirtyOverwrite(path)
}

function applyRenameOpenFileOperation(
  from: string,
  to: string,
  context: WorkspaceConflictContext
) {
  const result = context.renameCachedEditorDocument(from, to)
  moveFileQueryData(context.queryClient, from, to)
  if (result.wasDirty) notifyDirtyOverwrite(from)
}

function applyDeletedConflictOperation(
  path: string,
  context: WorkspaceConflictContext
) {
  notifyDeletedFilesystemConflict(path, context)
}

async function applyRenamedConflictOperation(
  localPath: string,
  remotePath: string,
  context: WorkspaceConflictContext
) {
  await notifyRenamedFilesystemConflict(localPath, remotePath, context)
}

function cachedDocumentText(path: string, context: WorkspaceConflictContext) {
  return context.getCachedEditorDocument(path)?.session.getText() ?? null
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

function isDirtyCachedDocument(
  path: string,
  dirtyFilePaths: ReadonlySet<string>,
  context: WorkspaceConflictContext
) {
  return (
    dirtyFilePaths.has(path) ||
    context.getCachedEditorDocument(path)?.session.isDirty() === true
  )
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

async function streamWorkspaceEvents(
  rootPath: string,
  signal: AbortSignal,
  onMessage: (message: WatchServerMessage) => void
) {
  const response = await fsClient.fs.events.get({
    query: { path: rootPath },
    fetch: { signal },
  })
  if (response.error)
    throw new Error(`File watcher failed with status ${response.status}`)
  if (!response.data)
    throw new Error("File watcher response did not include a stream.")

  for await (const event of parseEdenSseStream(response.data)) {
    const message = watchServerMessage(event.data)
    if (!message) continue

    onMessage(message)
  }
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

function notifyDirtyOverwrite(path: string) {
  // TODO(conflicts): Replace overwrite behavior with conflict resolution state/view.
  toast.error("Local edits were overwritten", {
    description: `${path} changed on disk. The remote version replaced your unsaved local edits.`,
  })
}

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"))
      return
    }

    const onAbort = () => {
      window.clearTimeout(timeout)
      reject(new DOMException("Aborted", "AbortError"))
    }
    const timeout = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    signal.addEventListener("abort", onAbort, { once: true })
  })
}
