import type { PickedFsEntry } from "@/components/file-picker-dialog"
import { useEditorState } from "@/components/editor/editor-state"
import { errorMessage, fetchFile, fetchTree } from "@/lib/file-server"
import type { FileResult, TreeEntry } from "@/lib/file-system-types"
import { fsServerUrl } from "@/lib/fs-client"
import { fileSystemKeys } from "@/lib/query-keys"
import { parseSseStream } from "@/lib/sse"
import { toTreePath } from "@/lib/path-formatters"
import { affectedOpenFileRefreshPaths } from "@/lib/workspace-event-model"
import {
  patchTreeEntryMetadata,
  replaceDirectoryLoad,
  type TreeModel,
} from "@/lib/tree-model"
import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useEffectEvent } from "react"
import { toast } from "sonner"

export type WatchServerMessage =
  | { type: "ready"; root: string }
  | { type: "created"; path: string; entry?: TreeEntry }
  | { type: "changed"; path: string; entry?: TreeEntry }
  | { type: "deleted"; path: string }
  | { type: "renamed"; path: string; oldPath: string; entry?: TreeEntry }
  | { type: "error"; code: string; message: string }

export type FilesystemEvent = Extract<
  WatchServerMessage,
  { type: "created" | "changed" | "deleted" | "renamed" }
>

const EVENT_BATCH_DELAY_MS = 100
const FILE_REFRESH_RETRY_DELAY_MS = 80
const FILE_REFRESH_RETRY_ATTEMPTS = 5
const WATCH_DEBUG = import.meta.env.DEV

export function useWorkspaceEvents(rootFolder: PickedFsEntry | null) {
  const queryClient = useQueryClient()
  const dirtyFilePaths = useEditorState((state) => state.dirtyFilePaths)
  const openFilePaths = useEditorState((state) => state.openFilePaths)
  const selectedFilePath = useEditorState((state) => state.selectedFilePath)
  const discardCachedEditorDocument = useEditorState(
    (state) => state.discardCachedEditorDocument
  )
  const forceReplaceCachedEditorDocument = useEditorState(
    (state) => state.forceReplaceCachedEditorDocument
  )
  const renameCachedEditorDocument = useEditorState(
    (state) => state.renameCachedEditorDocument
  )
  const rootPath = rootFolder?.path ?? null
  const applyEvents = useEffectEvent(
    (
      events: FilesystemEvent[],
      signal: AbortSignal,
      currentRootPath: string
    ) => {
      watchLog("apply", {
        dirtyFilePaths: [...dirtyFilePaths],
        events,
        openFilePaths,
        rootPath: currentRootPath,
      })

      void applyWorkspaceEvents({
        discardCachedEditorDocument,
        events,
        forceReplaceCachedEditorDocument,
        openFilePaths,
        queryClient,
        renameCachedEditorDocument,
        rootPath: currentRootPath,
        signal,
      }).catch((error: unknown) => {
        if (signal.aborted) return

        watchLog("apply-error", error)
        notifyUpdateError(errorMessage(error))
      })
    }
  )
  const applyReady = useEffectEvent(
    (signal: AbortSignal, currentRootPath: string) => {
      const refreshPaths =
        selectedFilePath && !dirtyFilePaths.has(selectedFilePath)
          ? [selectedFilePath]
          : []
      watchLog("ready-refresh", {
        dirtyFilePaths: [...dirtyFilePaths],
        openFilePaths,
        refreshPaths,
        rootPath: currentRootPath,
        selectedFilePath,
      })

      void applyWorkspaceReady({
        forceReplaceCachedEditorDocument,
        openFilePaths: refreshPaths,
        queryClient,
        rootPath: currentRootPath,
        signal,
      }).catch((error: unknown) => {
        if (signal.aborted) return

        watchLog("ready-refresh-error", error)
        notifyUpdateError(errorMessage(error))
      })
    }
  )

  useEffect(() => {
    if (!rootPath) return

    const controller = new AbortController()
    const queue = createEventQueue((events) =>
      applyEvents(events, controller.signal, rootPath)
    )
    watchLog("subscribe", {
      rootPath,
      url: workspaceEventsUrl(rootPath).toString(),
    })

    void streamWorkspaceEvents(
      rootPath,
      controller.signal,
      (message) => {
        watchLog("message", message)
        if (message.type === "ready") {
          applyReady(controller.signal, rootPath)
          return
        }
        if (message.type === "error") {
          notifyStreamError(message.message)
          return
        }

        queue.push(message)
      }
    ).catch((error: unknown) => {
      if (controller.signal.aborted) return

      watchLog("stream-error", error)
      notifyStreamError(errorMessage(error))
    })

    return () => {
      watchLog("unsubscribe", { rootPath })
      controller.abort()
      queue.clear()
    }
  }, [rootPath])
}

async function applyWorkspaceEvents({
  discardCachedEditorDocument,
  events,
  forceReplaceCachedEditorDocument,
  openFilePaths,
  queryClient,
  renameCachedEditorDocument,
  rootPath,
  signal,
}: {
  discardCachedEditorDocument: (path: string) => { wasDirty: boolean }
  events: FilesystemEvent[]
  forceReplaceCachedEditorDocument: (file: FileResult) => { wasDirty: boolean }
  openFilePaths: readonly string[]
  queryClient: ReturnType<typeof useQueryClient>
  renameCachedEditorDocument: (
    from: string,
    to: string
  ) => { wasDirty: boolean }
  rootPath: string
  signal: AbortSignal
}) {
  patchChangedTreeEntries(queryClient, rootPath, events)
  await refreshAffectedTreeDirectories(queryClient, rootPath, events, signal)
  await refreshAffectedOpenFiles({
    discardCachedEditorDocument,
    events,
    forceReplaceCachedEditorDocument,
    openFilePaths,
    queryClient,
    renameCachedEditorDocument,
    rootPath,
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
  await refreshTreeDirectory(queryClient, rootPath, rootPath, signal).catch(
    () => null
  )

  await Promise.all(
    openFilePaths.map((path) =>
      refreshChangedOpenFile(
        queryClient,
        path,
        forceReplaceCachedEditorDocument,
        signal
      ).catch((error: unknown) => {
        if (signal.aborted) return

        watchLog("ready-file-refresh-error", {
          error: errorMessage(error),
          path,
        })
      })
    )
  )
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
  if (!model) {
    watchLog("tree-skip-no-model", { path, rootPath })
    return
  }
  if (!shouldRefreshDirectory(model, rootPath, path)) {
    watchLog("tree-skip-unloaded-directory", { path, rootPath })
    return
  }

  watchLog("tree-refresh", { path, rootPath })
  const result = await fetchTree(path, signal)
  queryClient.setQueryData(rootTreeKey, (current: TreeModel | undefined) => {
    if (!current) return current

    return replaceDirectoryLoad(current, rootPath, result)
  })
}

async function refreshAffectedOpenFiles({
  discardCachedEditorDocument,
  events,
  forceReplaceCachedEditorDocument,
  openFilePaths,
  queryClient,
  renameCachedEditorDocument,
  rootPath,
  signal,
}: {
  discardCachedEditorDocument: (path: string) => { wasDirty: boolean }
  events: readonly FilesystemEvent[]
  forceReplaceCachedEditorDocument: (file: FileResult) => { wasDirty: boolean }
  openFilePaths: readonly string[]
  queryClient: ReturnType<typeof useQueryClient>
  renameCachedEditorDocument: (
    from: string,
    to: string
  ) => { wasDirty: boolean }
  rootPath: string
  signal: AbortSignal
}) {
  const recreatedPaths = recreatedOpenFilePaths(events)
  const refreshPaths = affectedOpenFileRefreshPaths(
    events,
    openFilePaths,
    recreatedPaths,
    rootPath
  )
  watchLog("file-refresh-candidates", {
    events,
    openFilePaths,
    refreshPaths,
  })

  for (const event of events) {
    if (event.type === "deleted") {
      if (recreatedPaths.has(event.path)) continue

      discardDeletedOpenFiles(
        event.path,
        openFilePaths,
        discardCachedEditorDocument,
        queryClient
      )
      continue
    }
    if (event.type !== "renamed") continue

    renameOpenFiles(
      event,
      openFilePaths,
      renameCachedEditorDocument,
      queryClient
    )
  }

  for (const path of refreshPaths) {
    await refreshChangedOpenFile(
      queryClient,
      path,
      forceReplaceCachedEditorDocument,
      signal
    )
  }
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
  signal: AbortSignal
) {
  watchLog("file-refresh", { path })
  const file = await fetchFileWithRetry(path, signal)
  queryClient.setQueryData(fileSystemKeys.file(path), file)
  const result = forceReplaceCachedEditorDocument(file)
  watchLog("file-replaced", {
    mtimeMs: file.mtimeMs,
    path,
    wasDirty: result.wasDirty,
  })
  if (result.wasDirty) notifyDirtyOverwrite(path)
}

async function fetchFileWithRetry(path: string, signal: AbortSignal) {
  let lastError: unknown = null

  for (let attempt = 0; attempt < FILE_REFRESH_RETRY_ATTEMPTS; attempt += 1) {
    try {
      watchLog("file-fetch-attempt", { attempt: attempt + 1, path })
      return await fetchFile(path, signal)
    } catch (error) {
      lastError = error
      if (signal.aborted) throw error
      watchLog("file-fetch-retry", {
        attempt: attempt + 1,
        error: errorMessage(error),
        path,
      })
      await delay(FILE_REFRESH_RETRY_DELAY_MS, signal)
    }
  }

  throw lastError
}

function discardDeletedOpenFiles(
  path: string,
  openFilePaths: readonly string[],
  discardCachedEditorDocument: (path: string) => { wasDirty: boolean },
  queryClient: ReturnType<typeof useQueryClient>
) {
  for (const openPath of openFilePaths) {
    if (!isSameOrChildPath(openPath, path)) continue

    watchLog("file-discard", { openPath, path })
    const result = discardCachedEditorDocument(openPath)
    queryClient.removeQueries({
      exact: true,
      queryKey: fileSystemKeys.file(openPath),
    })
    if (result.wasDirty) notifyDirtyOverwrite(openPath)
  }
}

function renameOpenFiles(
  event: Extract<FilesystemEvent, { type: "renamed" }>,
  openFilePaths: readonly string[],
  renameCachedEditorDocument: (
    from: string,
    to: string
  ) => { wasDirty: boolean },
  queryClient: ReturnType<typeof useQueryClient>
) {
  for (const openPath of openFilePaths) {
    const nextPath = renamedPath(openPath, event.oldPath, event.path)
    if (!nextPath) continue

    watchLog("file-rename", { nextPath, openPath })
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
      watchLog("queue", event)
      queued.push(event)
      if (timeout !== null) return

      timeout = window.setTimeout(() => {
        const events = queued
        queued = []
        timeout = null
        watchLog("flush", { events })
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

function notifyStreamError(message: string) {
  toast.error("File watcher stopped", {
    description: message,
  })
}

function notifyUpdateError(message: string) {
  toast.error("File watcher update failed", {
    description: message,
  })
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

function watchLog(message: string, data?: unknown) {
  if (!WATCH_DEBUG) return

  console.log("[fs-watch]", message, data)
}
