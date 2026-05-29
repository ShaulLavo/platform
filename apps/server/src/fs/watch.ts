import parcelWatcher from '@parcel/watcher'
import { watch } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { FsError } from './errors'
import { defaultIgnoredNames, isIgnoredPath, toPosix, type WorkspacePaths } from './path'
import { statPath, type FsStat } from './stat'
import type { TreeEntry, WatchServerMessage } from './contracts'

type Listener = (event: WatchServerMessage) => void
type ParcelWatchEvent = parcelWatcher.Event
type WatchRelease = () => void | Promise<void>
type WatcherEntry = {
  refCount: number
  release: WatchRelease
}

const watcherIgnoreGlobs = defaultIgnoredNames.flatMap((name) => [
  name,
  `${name}/**`,
  `**/${name}`,
  `**/${name}/**`,
])

export type WatchOptions = {
  enabled: boolean
}

export class FileChangeHub {
  private readonly listeners = new Set<Listener>()
  private readonly nativeWatchers = new Map<string, WatcherEntry>()
  private readonly paths: WorkspacePaths
  private readonly watchEnabled: boolean
  private nextSequence = 1

  constructor(paths: WorkspacePaths, options: WatchOptions) {
    this.paths = paths
    this.watchEnabled = options.enabled
  }

  emit(event: WatchServerMessage) {
    if (!isFilesystemEvent(event)) return this.broadcastSequenced(event)
    if (isIgnoredPath(event.path)) return

    this.broadcastSequenced(event)
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

  async close() {
    const releases = Array.from(this.nativeWatchers.values()).map((entry) => entry.release)
    this.nativeWatchers.clear()
    this.listeners.clear()
    await releaseWatchers(releases)
  }

  private async retainWatcher(
    relativeRoot: string,
    onError: (event: WatchServerMessage) => void,
  ): Promise<WatchRelease> {
    if (!this.watchEnabled) {
      return noop
    }

    const existing = this.nativeWatchers.get(relativeRoot)
    if (existing) {
      existing.refCount += 1
      return () => this.releaseWatcher(relativeRoot)
    }

    const release = await this.createWatcher(relativeRoot, onError)
    this.nativeWatchers.set(relativeRoot, { refCount: 1, release })

    return () => this.releaseWatcher(relativeRoot)
  }

  private async releaseWatcher(relativeRoot: string) {
    const entry = this.nativeWatchers.get(relativeRoot)
    if (!entry) return

    entry.refCount -= 1
    if (entry.refCount > 0) return

    this.nativeWatchers.delete(relativeRoot)
    await releaseWatcher(entry.release)
  }

  private async createWatcher(
    relativeRoot: string,
    onError: (event: WatchServerMessage) => void,
  ): Promise<WatchRelease> {
    try {
      return await this.createParcelWatcher(relativeRoot, onError)
    } catch {
      return this.createNodeWatcher(relativeRoot, onError)
    }
  }

  private async createParcelWatcher(
    relativeRoot: string,
    onError: (event: WatchServerMessage) => void,
  ): Promise<WatchRelease> {
    const target = this.paths.resolve(relativeRoot)
    const subscription = await parcelWatcher.subscribe(
      target.absolutePath,
      (error, events) => {
        if (error) {
          onError(watchError(error, relativeRoot))
          return
        }

        for (const event of events) {
          void this.handleParcelEvent(relativeRoot, event)
        }
      },
      { ignore: watcherIgnoreGlobs },
    )

    return () => subscription.unsubscribe()
  }

  private createNodeWatcher(
    relativeRoot: string,
    onError: (event: WatchServerMessage) => void,
  ): WatchRelease {
    try {
      const target = this.paths.resolve(relativeRoot)
      const watcher = watch(target.absolutePath, { recursive: true }, (event, filename) => {
        void this.handleNodeEvent(relativeRoot, event, filename?.toString() ?? '')
      })
      watcher.on('error', (error) => {
        onError(watchError(error, relativeRoot))
      })
      return () => watcher.close()
    } catch (error) {
      onError(watchError(error, relativeRoot))
      return noop
    }
  }

  private async handleParcelEvent(relativeRoot: string, event: ParcelWatchEvent) {
    const relativePath = parcelEventPath(this.paths, event.path)
    if (relativePath === null) return
    if (isStaleParcelRootCreate(relativeRoot, event, relativePath)) return
    if (isIgnoredPath(relativePath)) return

    const type = parcelEventType(event.type)
    const entry = type === 'deleted' ? undefined : await nativeEventEntry(this.paths, relativePath)

    this.emit(nativeWatchEvent(type, relativePath, entry))
  }

  private async handleNodeEvent(relativeRoot: string, nativeEvent: string, filename: string) {
    const relativePath = watchEventPath(relativeRoot, filename)
    if (isIgnoredPath(relativePath)) return

    const type = await nativeEventType(this.paths, relativePath, nativeEvent)
    const entry = type === 'deleted' ? undefined : await nativeEventEntry(this.paths, relativePath)

    this.emit(nativeWatchEvent(type, relativePath, entry))
  }

  private async *createStream(subscribed: Set<string>, signal?: AbortSignal) {
    const queue: WatchServerMessage[] = [{ type: 'ready', root: '' }]
    let wake: (() => void) | null = null

    const listener = (event: WatchServerMessage) => {
      if (!shouldDeliver(event, subscribed)) return

      queue.push(event)
      wake?.()
    }

    const abort = () => wake?.()
    const enqueue = (event: WatchServerMessage) => {
      const sequenced = this.withSequence(event)
      if (!shouldDeliver(sequenced, subscribed)) return

      queue.push(sequenced)
      wake?.()
    }
    let releases: WatchRelease[] = []
    this.listeners.add(listener)
    signal?.addEventListener('abort', abort)

    try {
      releases = await Promise.all(
        Array.from(subscribed).map((input) => this.retainWatcher(input, enqueue)),
      )

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
      await releaseWatchers(releases)
      this.listeners.delete(listener)
      signal?.removeEventListener('abort', abort)
    }
  }

  private broadcastSequenced(event: WatchServerMessage) {
    this.broadcast(this.withSequence(event))
  }

  private broadcast(event: WatchServerMessage) {
    for (const listener of this.listeners) listener(event)
  }

  private withSequence(event: WatchServerMessage): WatchServerMessage {
    return { ...event, sequence: this.nextSequence++ }
  }
}

function subscribedPaths(paths: WorkspacePaths, inputs: string[]) {
  const subscribed = new Set(inputs.map((input) => paths.resolve(input).relativePath))
  if (!subscribed.size) subscribed.add('')

  return subscribed
}

function watchEventPath(relativeRoot: string, filename: string) {
  const relativeFilename = normalizeWatchFilename(filename)
  if (!relativeFilename) return relativeRoot
  if (!relativeRoot) return relativeFilename

  return toPosix(path.join(relativeRoot, relativeFilename))
}

function parcelEventPath(paths: WorkspacePaths, absolutePath: string) {
  const candidate = path.resolve(absolutePath)
  return (
    relativePathInside(paths.workspaceRoot, candidate) ??
    relativePathInside(paths.workspaceRootReal, candidate)
  )
}

function relativePathInside(root: string, candidate: string) {
  const relative = path.relative(root, candidate)
  if (relative === '') return ''
  if (relative.startsWith('..')) return null
  if (path.isAbsolute(relative)) return null

  return toPosix(relative)
}

function normalizeWatchFilename(filename: string) {
  return toPosix(filename).replace(/^\/+/u, '')
}

function parcelEventType(type: ParcelWatchEvent['type']): 'created' | 'changed' | 'deleted' {
  if (type === 'create') return 'created'
  if (type === 'update') return 'changed'

  return 'deleted'
}

function isStaleParcelRootCreate(
  relativeRoot: string,
  event: ParcelWatchEvent,
  relativePath: string,
) {
  return event.type === 'create' && relativePath === relativeRoot
}

function isFilesystemEvent(event: WatchServerMessage) {
  return (
    event.type === 'created' ||
    event.type === 'changed' ||
    event.type === 'deleted' ||
    event.type === 'renamed'
  )
}

function shouldDeliver(event: WatchServerMessage, subscribed: Set<string>) {
  if (!isFilesystemEvent(event)) return true
  if (isSubscribedPath(event.path, subscribed)) return true
  if (event.type === 'renamed') return isSubscribedPath(event.oldPath, subscribed)

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
  nativeEvent: string,
): Promise<'created' | 'changed' | 'deleted'> {
  if (nativeEvent === 'change') return 'changed'

  const exists = await pathExists(paths, relativePath)
  return exists ? 'created' : 'deleted'
}

function nativeWatchEvent(
  type: 'created' | 'changed' | 'deleted',
  path: string,
  entry: TreeEntry | undefined,
): WatchServerMessage {
  if (type === 'deleted') return { type, path }
  if (!entry) return { type, path }

  return { type, path, entry, version: entry.version }
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
  relativePath: string,
): Promise<TreeEntry | undefined> {
  try {
    return entryFromStat(await statPath(paths, relativePath))
  } catch {
    return undefined
  }
}

function entryFromStat(stat: FsStat): TreeEntry {
  return {
    path: stat.path,
    name: pathBasename(stat.path),
    type: stat.type,
    targetType: stat.targetType,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    birthtimeMs: stat.birthtimeMs,
    version: stat.version,
  }
}

function pathBasename(input: string) {
  const parts = input.split('/').filter(Boolean)
  return parts.at(-1) ?? 'Root'
}

function watchError(error: unknown, path: string): WatchServerMessage {
  return {
    type: 'error',
    code: 'WATCH_FAILED',
    message: `failed to watch ${path || '/'}: ${errorMessage(error)}`,
  }
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message

  return 'native filesystem watcher failed'
}

async function releaseWatchers(releases: WatchRelease[]) {
  await Promise.all(releases.map(releaseWatcher))
}

async function releaseWatcher(release: WatchRelease) {
  try {
    await release()
  } catch {
    // Watcher teardown should not fail the owning SSE stream.
  }
}

function noop() {}

export function parseWatchInputs(pathInput?: string, pathsInput?: string | string[]) {
  const inputs = [pathInput].concat(pathInputs(pathsInput))
  const trimmed = inputs.map((input) => input?.trim() ?? '').filter(Boolean)

  if (!trimmed.length) return []
  if (trimmed.some((input) => input.includes(path.delimiter))) throw new FsError('INVALID_PATH')

  return trimmed
}

function pathInputs(input?: string | string[]) {
  if (!input) return []
  if (Array.isArray(input)) return input

  return input.split(',')
}
