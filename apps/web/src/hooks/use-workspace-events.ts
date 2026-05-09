import type { PickedFsEntry } from "@/components/file-picker-dialog"
import { useEditorState } from "@/components/editor/editor-state"
import { errorMessage, fetchFile, fetchTree } from "@/lib/file-server"
import type { FileResult } from "@/lib/file-system-types"
import { fsServerUrl } from "@/lib/fs-client"
import { fileSystemKeys } from "@/lib/query-keys"
import { parseSseStream } from "@/lib/sse"
import { toTreePath } from "@/lib/path-formatters"
import { replaceDirectoryLoad, type TreeModel } from "@/lib/tree-model"
import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useEffectEvent } from "react"
import { toast } from "sonner"

type WatchServerMessage =
  | { type: "ready"; root: string }
  | { type: "created"; path: string }
  | { type: "changed"; path: string }
  | { type: "deleted"; path: string }
  | { type: "renamed"; path: string; oldPath: string }
  | { type: "error"; code: string; message: string }

type FilesystemEvent = Extract<
  WatchServerMessage,
  { type: "created" | "changed" | "deleted" | "renamed" }
>

const EVENT_BATCH_DELAY_MS = 100

export function useWorkspaceEvents(rootFolder: PickedFsEntry | null) {
  const queryClient = useQueryClient()
  const openFilePaths = useEditorState((state) => state.openFilePaths)
  const discardCachedEditorDocument = useEditorState(
    (state) => state.discardCachedEditorDocument
  )
  const forceReplaceCachedEditorDocument = useEditorState(
    (state) => state.forceReplaceCachedEditorDocument
  )
  const renameCachedEditorDocument = useEditorState(
    (state) => state.renameCachedEditorDocument
  )
  const applyEvents = useEffectEvent(
    (events: FilesystemEvent[], signal: AbortSignal) => {
      if (!rootFolder) return

      void applyWorkspaceEvents({
        discardCachedEditorDocument,
        events,
        forceReplaceCachedEditorDocument,
        openFilePaths,
        queryClient,
        renameCachedEditorDocument,
        rootPath: rootFolder.path,
        signal,
      })
    }
  )

  useEffect(() => {
    if (!rootFolder) return

    const controller = new AbortController()
    const queue = createEventQueue((events) =>
      applyEvents(events, controller.signal)
    )

    void streamWorkspaceEvents(
      rootFolder.path,
      controller.signal,
      (message) => {
        if (message.type === "ready") return
        if (message.type === "error") return notifyStreamError(message.message)

        queue.push(message)
      }
    ).catch((error: unknown) => {
      if (controller.signal.aborted) return

      notifyStreamError(errorMessage(error))
    })

    return () => {
      controller.abort()
      queue.clear()
    }
  }, [applyEvents, rootFolder])
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
  await refreshAffectedTreeDirectories(queryClient, rootPath, events, signal)
  await refreshAffectedOpenFiles({
    discardCachedEditorDocument,
    events,
    forceReplaceCachedEditorDocument,
    openFilePaths,
    queryClient,
    renameCachedEditorDocument,
    signal,
  })
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
      refreshTreeDirectory(queryClient, rootPath, path, signal)
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
  discardCachedEditorDocument,
  events,
  forceReplaceCachedEditorDocument,
  openFilePaths,
  queryClient,
  renameCachedEditorDocument,
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
  signal: AbortSignal
}) {
  for (const event of events) {
    if (event.type === "changed") {
      await refreshChangedOpenFile(
        queryClient,
        event.path,
        openFilePaths,
        forceReplaceCachedEditorDocument,
        signal
      )
      continue
    }
    if (event.type === "deleted") {
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
}

async function refreshChangedOpenFile(
  queryClient: ReturnType<typeof useQueryClient>,
  path: string,
  openFilePaths: readonly string[],
  forceReplaceCachedEditorDocument: (file: FileResult) => { wasDirty: boolean },
  signal: AbortSignal
) {
  if (!openFilePaths.includes(path)) return

  const file = await fetchFile(path, signal)
  queryClient.setQueryData(fileSystemKeys.file(path), file)
  const result = forceReplaceCachedEditorDocument(file)
  if (result.wasDirty) notifyDirtyOverwrite(path)
}

function discardDeletedOpenFiles(
  path: string,
  openFilePaths: readonly string[],
  discardCachedEditorDocument: (path: string) => { wasDirty: boolean },
  queryClient: ReturnType<typeof useQueryClient>
) {
  for (const openPath of openFilePaths) {
    if (!isSameOrChildPath(openPath, path)) continue

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

function notifyStreamError(message: string) {
  toast.error("File watcher stopped", {
    description: message,
  })
}

function notifyDirtyOverwrite(path: string) {
  // TODO(conflicts): Replace overwrite behavior with conflict resolution state/view.
  toast.error("Local edits were overwritten", {
    description: `${path} changed on disk. The remote version replaced your unsaved local edits.`,
  })
}
