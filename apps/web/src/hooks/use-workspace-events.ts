import type { PickedFsEntry } from "@/components/file-picker-dialog"
import { useEditorCommands } from "@/features/editor/state/editor-commands"
import { useEditorDocumentState } from "@/features/editor/state/editor-document-state"
import { useEditorWorkspaceState } from "@/features/editor/state/editor-workspace-state"
import { reportError, toClientError } from "@/lib/client-error-taxonomy"
import { fetchFile, fetchTree } from "@/lib/file-server"
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
import { useEffect, useEffectEvent } from "react"
import { toast } from "sonner"
import type { WatchServerMessage } from "@workspace/contracts"

export type { WatchServerMessage }

export type FilesystemEvent = Extract<
  WatchServerMessage,
  { type: "created" | "changed" | "deleted" | "renamed" }
>

/**
 * Debounce window applied between the first filesystem event arriving and the
 * queue flushing to React Query / editor state.
 *
 * Unit: milliseconds.
 *
 * Rationale: A single user-facing action (saving a file, running a formatter,
 * switching a git branch) typically produces a burst of `created` / `changed`
 * / `deleted` / `renamed` events within a few dozen milliseconds. Flushing on
 * every event would trigger one `refreshTreeDirectory` + `fetchFile` round per
 * event and thrash the editor cache. A 100 ms window is short enough to stay
 * well under the ~150 ms threshold where users start to perceive UI latency,
 * while long enough to coalesce those bursts into a single batched
 * `applyWorkspaceEvents` pass.
 */
const EVENT_BATCH_DELAY_MS = 100

/**
 * Delay between successive attempts in {@link fetchFileWithRetry} when a file
 * refresh triggered by a filesystem event fails.
 *
 * Unit: milliseconds.
 *
 * Rationale: File watchers commonly fire a `changed` event before the writer
 * has finished flushing the new contents to disk, so an immediate read can
 * race the write and fail (partial read, `ENOENT` on an atomic rename, stat
 * mismatch). An 80 ms gap is long enough for the vast majority of local disk
 * writes to settle without being perceptible to the user; combined with the
 * retry count below it caps the worst-case refresh latency at well under half
 * a second.
 */
const FILE_REFRESH_RETRY_DELAY_MS = 80

/**
 * Maximum number of attempts {@link fetchFileWithRetry} makes before giving up
 * and surfacing the error through the Client_Error_Taxonomy's `reportError`.
 *
 * Unit: integer count (not a duration).
 *
 * Rationale: Paired with {@link FILE_REFRESH_RETRY_DELAY_MS}, five attempts
 * bound the total retry window to roughly 320 ms (four inter-attempt sleeps of
 * 80 ms), which comfortably covers the write-settling races described above
 * without letting a genuinely missing or permission-denied file hang the user
 * behind a long silent retry loop.
 */
const FILE_REFRESH_RETRY_ATTEMPTS = 5

export function useWorkspaceEvents(rootFolder: PickedFsEntry | null) {
  const queryClient = useQueryClient()
  const dirtyFilePaths = useEditorDocumentState((state) => state.dirtyFilePaths)
  const forceReplaceCachedEditorDocument = useEditorDocumentState(
    (state) => state.forceReplaceCachedEditorDocument
  )
  const openFilePaths = useEditorWorkspaceState((state) => state.openFilePaths)
  const selectedFilePath = useEditorWorkspaceState(
    (state) => state.selectedFilePath
  )
  const { discardCachedEditorDocument, renameCachedEditorDocument } =
    useEditorCommands()
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
        discardCachedEditorDocument,
        events,
        forceReplaceCachedEditorDocument: forceReplaceSelectedDocument,
        openFilePaths,
        queryClient,
        renameCachedEditorDocument,
        rootPath: currentRootPath,
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
        // Forward the full SSE error frame so toClientError can inspect
        // the server-emitted `code` (e.g. GIT_REPOSITORY_NOT_FOUND) when
        // it matches an FsErrorCode; otherwise it falls to `unknown`.
        reportError(toClientError(message))
        return
      }
      // The contracts `WatchServerMessage` union is a superset of what
      // the web app drives behavior off of. `subscribed`,
      // `unsubscribed`, and `pong` are acknowledgement frames that
      // carry no filesystem mutation, so they flow through as no-ops
      // and are not enqueued for `applyWorkspaceEvents`.
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
  invalidateGitState(queryClient)
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
  await refreshTreeDirectory(queryClient, rootPath, rootPath, signal).catch(
    () => null
  )

  await Promise.all(
    fileBackedOpenPaths(openFilePaths).map((path) =>
      refreshChangedOpenFile(
        queryClient,
        path,
        forceReplaceCachedEditorDocument,
        signal
      ).catch(() => undefined)
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
        discardCachedEditorDocument,
        queryClient
      )
      continue
    }
    if (event.type !== "renamed") continue

    renameOpenFiles(
      event,
      fileBackedPaths,
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

function fileBackedOpenPaths(openFilePaths: readonly string[]) {
  return openFilePaths.filter((path) => !parseDiffDocumentId(path))
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
