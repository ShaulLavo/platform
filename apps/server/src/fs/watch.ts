import { watch, type FSWatcher } from "node:fs"
import { stat } from "node:fs/promises"
import path from "node:path"
import { FsError } from "./errors"
import { isIgnoredPath, toPosix, type WorkspacePaths } from "./path"
import { statPath, type FsStat } from "./stat"
import type { TreeEntryLike, WatchServerMessage } from "./contracts"

type Listener = (event: WatchServerMessage) => void
type WatchRelease = () => void
type WatcherEntry = {
  refCount: number
  watcher: FSWatcher
}

export type WatchOptions = {
  enabled: boolean
}

export class FileChangeHub {
  private readonly listeners = new Set<Listener>()
  private readonly nativeWatchers = new Map<string, WatcherEntry>()
  private readonly paths: WorkspacePaths
  private readonly watchEnabled: boolean

  constructor(paths: WorkspacePaths, options: WatchOptions) {
    this.paths = paths
    this.watchEnabled = options.enabled
  }

  emit(event: WatchServerMessage) {
    if (!isFilesystemEvent(event)) return this.broadcast(event)
    if (isIgnoredPath(event.path)) return

    this.broadcast(event)
  }

  stream(inputs: string[], signal?: AbortSignal) {
    const subscribed = subscribedPaths(this.paths, inputs)
    return this.createStream(subscribed, signal)
  }

  info() {
    return {
      nativeWatcherCount: this.nativeWatchers.size,
      watchEnabled: this.watchEnabled,
    }
  }

  close() {
    for (const entry of this.nativeWatchers.values()) entry.watcher.close()
    this.nativeWatchers.clear()
    this.listeners.clear()
  }

  private retainWatcher(
    relativeRoot: string,
    onError: (event: WatchServerMessage) => void
  ): WatchRelease {
    if (!this.watchEnabled) {
      return noop
    }

    const existing = this.nativeWatchers.get(relativeRoot)
    if (existing) {
      existing.refCount += 1
      return () => this.releaseWatcher(relativeRoot)
    }

    try {
      const target = this.paths.resolve(relativeRoot)
      const watcher = watch(
        target.absolutePath,
        { recursive: true },
        (event, filename) => {
          void this.handleNativeEvent(
            relativeRoot,
            event,
            filename?.toString() ?? ""
          )
        }
      )
      watcher.on("error", (error) => {
        onError(watchError(error, relativeRoot))
      })
      this.nativeWatchers.set(relativeRoot, { refCount: 1, watcher })
    } catch (error) {
      onError(watchError(error, relativeRoot))
      return noop
    }

    return () => this.releaseWatcher(relativeRoot)
  }

  private releaseWatcher(relativeRoot: string) {
    const entry = this.nativeWatchers.get(relativeRoot)
    if (!entry) return

    entry.refCount -= 1
    if (entry.refCount > 0) return

    entry.watcher.close()
    this.nativeWatchers.delete(relativeRoot)
  }

  private async handleNativeEvent(
    relativeRoot: string,
    nativeEvent: string,
    filename: string
  ) {
    const relativePath = watchEventPath(relativeRoot, filename)
    if (isIgnoredPath(relativePath)) return

    const type = await nativeEventType(this.paths, relativePath, nativeEvent)
    const entry =
      type === "deleted" ? undefined : await nativeEventEntry(this.paths, relativePath)

    this.broadcast(nativeWatchEvent(type, relativePath, entry))
  }

  private async *createStream(subscribed: Set<string>, signal?: AbortSignal) {
    const queue: WatchServerMessage[] = [{ type: "ready", root: "" }]
    let wake: (() => void) | null = null

    const listener = (event: WatchServerMessage) => {
      if (!shouldDeliver(event, subscribed)) return

      queue.push(event)
      wake?.()
    }

    const abort = () => wake?.()
    const enqueue = (event: WatchServerMessage) => {
      if (!shouldDeliver(event, subscribed)) return

      queue.push(event)
      wake?.()
    }
    const releases = [...subscribed].map((input) =>
      this.retainWatcher(input, enqueue)
    )
    this.listeners.add(listener)
    signal?.addEventListener("abort", abort)

    try {
      while (!signal?.aborted) {
        if (queue.length) {
          yield queue.shift()!
          continue
        }

        await new Promise<void>((resolve) => {
          wake = resolve
        })
        wake = null
      }
    } finally {
      for (const release of releases) release()
      this.listeners.delete(listener)
      signal?.removeEventListener("abort", abort)
    }
  }

  private broadcast(event: WatchServerMessage) {
    for (const listener of this.listeners) listener(event)
  }
}

function subscribedPaths(paths: WorkspacePaths, inputs: string[]) {
  const subscribed = new Set(
    inputs.map((input) => paths.resolve(input).relativePath)
  )
  if (!subscribed.size) subscribed.add("")

  return subscribed
}

function watchEventPath(relativeRoot: string, filename: string) {
  const relativeFilename = normalizeWatchFilename(filename)
  if (!relativeFilename) return relativeRoot
  if (!relativeRoot) return relativeFilename

  return toPosix(path.join(relativeRoot, relativeFilename))
}

function normalizeWatchFilename(filename: string) {
  return toPosix(filename).replace(/^\/+/u, "")
}

function isFilesystemEvent(event: WatchServerMessage) {
  return (
    event.type === "created" ||
    event.type === "changed" ||
    event.type === "deleted" ||
    event.type === "renamed"
  )
}

function shouldDeliver(event: WatchServerMessage, subscribed: Set<string>) {
  if (!isFilesystemEvent(event)) return true
  if (isSubscribedPath(event.path, subscribed)) return true
  if (event.type === "renamed")
    return isSubscribedPath(event.oldPath, subscribed)

  return false
}

function isSubscribedPath(relativePath: string, subscribed: Set<string>) {
  for (const root of subscribed) {
    if (!root) return true
    if (relativePath === root) return true
    if (relativePath.startsWith(`${root}/`)) return true
  }

  return false
}

async function nativeEventType(
  paths: WorkspacePaths,
  relativePath: string,
  nativeEvent: string
): Promise<"created" | "changed" | "deleted"> {
  if (nativeEvent === "change") return "changed"

  const exists = await pathExists(paths, relativePath)
  return exists ? "created" : "deleted"
}

function nativeWatchEvent(
  type: "created" | "changed" | "deleted",
  path: string,
  entry: TreeEntryLike | undefined
): WatchServerMessage {
  if (type === "deleted") return { type, path }
  if (!entry) return { type, path }

  return { type, path, entry }
}

async function pathExists(paths: WorkspacePaths, relativePath: string) {
  try {
    const target = paths.resolve(relativePath)
    await stat(target.absolutePath)
    return true
  } catch {
    return false
  }
}

async function nativeEventEntry(
  paths: WorkspacePaths,
  relativePath: string
): Promise<TreeEntryLike | undefined> {
  try {
    return entryFromStat(await statPath(paths, relativePath))
  } catch {
    return undefined
  }
}

function entryFromStat(stat: FsStat): TreeEntryLike {
  return {
    path: stat.path,
    name: pathBasename(stat.path),
    type: stat.type,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    birthtimeMs: stat.birthtimeMs,
  }
}

function pathBasename(input: string) {
  const parts = input.split("/").filter(Boolean)
  return parts.at(-1) ?? "Root"
}

function watchError(error: unknown, path: string): WatchServerMessage {
  return {
    type: "error",
    code: "WATCH_FAILED",
    message: `failed to watch ${path || "/"}: ${errorMessage(error)}`,
  }
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message

  return "native filesystem watcher failed"
}

function noop() {
  // no-op release for disabled or failed native watchers
}

export function parseWatchInputs(
  pathInput?: string,
  pathsInput?: string | string[]
) {
  const inputs = [pathInput, ...pathInputs(pathsInput)]
  const trimmed = inputs.map((input) => input?.trim() ?? "").filter(Boolean)

  if (!trimmed.length) return []
  if (trimmed.some((input) => input.includes(path.delimiter)))
    throw new FsError("INVALID_PATH")

  return trimmed
}

function pathInputs(input?: string | string[]) {
  if (!input) return []
  if (Array.isArray(input)) return input

  return input.split(",")
}
