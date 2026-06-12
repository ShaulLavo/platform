import parcelWatcher from '@parcel/watcher'
import { watch } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import type { FileSystemEntryMetadata } from '@workspace/contracts'
import { FsError } from './errors'
import { defaultIgnoredNames, isIgnoredPath, toPosix, type WorkspacePaths } from './path'
import { statPath } from './stat'
import type { TreeEntry, WatchServerMessage } from './contracts'

type Listener = (event: WatchServerMessage) => void
type ParcelWatchEvent = parcelWatcher.Event
type WatchRelease = () => void | Promise<void>
type RenameWatchServerMessage = Extract<WatchServerMessage, { type: 'renamed' }>
type WatcherEntry = {
  refCount: number
  release: WatchRelease
}
type WakeSlot = {
  current: (() => void) | null
}

const watcherIgnoredChildGlobs = defaultIgnoredNames.flatMap((name) => [
  `${name}/**`,
  `**/${name}/**`,
])

export type WatchBackend = 'auto' | 'node'

export type WatchOptions = {
  backend?: WatchBackend
  enabled: boolean
}

export type WatchStreamOptions = {
  includeIgnored?: boolean
}

export class FileChangeHub {
  private readonly backend: WatchBackend
  private readonly knownNativePaths = new Set<string>()
  private readonly listeners = new Set<Listener>()
  private readonly nativeWatchers = new Map<string, WatcherEntry>()
  private readonly paths: WorkspacePaths
  private readonly rawListeners = new Set<Listener>()
  private readonly watchEnabled: boolean
  private nextSequence = 1

  constructor(paths: WorkspacePaths, options: WatchOptions) {
    this.backend = options.backend ?? 'auto'
    this.paths = paths
    this.watchEnabled = options.enabled
  }

  emit(event: WatchServerMessage) {
    const sequenced = this.withSequence(event)
    if (!isFilesystemEvent(event)) {
      this.broadcast(sequenced)
      return
    }

    if (sequenced.type === 'renamed') {
      this.broadcastRenamed(sequenced)
      return
    }

    if (isIgnoredPath(event.path)) {
      this.broadcastRaw(sequenced)
      return
    }

    this.broadcast(sequenced)
  }

  stream(inputs: string[], signal?: AbortSignal, options: WatchStreamOptions = {}) {
    const subscribed = subscribedPaths(this.paths, inputs)
    const listeners = options.includeIgnored ? this.rawListeners : this.listeners
    return this.createStream(subscribed, signal, listeners)
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
    this.rawListeners.clear()
    await releaseWatchers(releases)
  }

  private async retainWatcher(relativeRoot: string): Promise<WatchRelease> {
    if (!this.watchEnabled) {
      return noop
    }

    const existing = this.nativeWatchers.get(relativeRoot)
    if (existing) {
      existing.refCount += 1
      return () => this.releaseWatcher(relativeRoot)
    }

    const release = await this.createWatcher(relativeRoot)
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

  private async createWatcher(relativeRoot: string): Promise<WatchRelease> {
    if (this.backend === 'node') return this.createNodeWatcher(relativeRoot)

    try {
      return await this.createParcelWatcher(relativeRoot)
    } catch {
      return this.createNodeWatcher(relativeRoot)
    }
  }

  private async createParcelWatcher(relativeRoot: string): Promise<WatchRelease> {
    const target = this.paths.resolve(relativeRoot)
    const subscription = await parcelWatcher.subscribe(
      target.absolutePath,
      (error, events) => {
        if (error) {
          this.emit(watchError(error, relativeRoot))
          return
        }

        for (const event of events) {
          void this.handleParcelEvent(relativeRoot, event)
        }
      },
      { ignore: watcherIgnoredChildGlobs },
    )

    return () => subscription.unsubscribe()
  }

  private createNodeWatcher(relativeRoot: string): WatchRelease {
    try {
      const target = this.paths.resolve(relativeRoot)
      const watcher = watch(target.absolutePath, { recursive: true }, (event, filename) => {
        void this.handleNodeEvent(relativeRoot, event, filename?.toString() ?? '')
      })
      watcher.on('error', (error) => {
        this.emit(watchError(error, relativeRoot))
      })
      return () => watcher.close()
    } catch (error) {
      this.emit(watchError(error, relativeRoot))
      return noop
    }
  }

  private async handleParcelEvent(relativeRoot: string, event: ParcelWatchEvent) {
    const relativePath = parcelEventPath(this.paths, event.path)
    if (relativePath === null) return
    if (isStaleParcelRootCreate(relativeRoot, event, relativePath)) return

    const type = parcelEventType(event.type)
    if (isIgnoredPath(relativePath)) {
      this.emit(nativeWatchEvent(type, relativePath, undefined))
      return
    }

    const entry = type === 'deleted' ? undefined : await nativeEventEntry(this.paths, relativePath)

    this.emit(nativeWatchEvent(type, relativePath, entry))
  }

  private async handleNodeEvent(relativeRoot: string, nativeEvent: string, filename: string) {
    const relativePath = watchEventPath(relativeRoot, filename)

    const type = await this.nativeEventType(relativePath, nativeEvent)
    if (isIgnoredPath(relativePath)) {
      this.recordNativeEventPath(relativePath, type)
      this.emit(nativeWatchEvent(type, relativePath, undefined))
      return
    }

    const entry = type === 'deleted' ? undefined : await nativeEventEntry(this.paths, relativePath)

    this.recordNativeEventPath(relativePath, type)
    this.emit(nativeWatchEvent(type, relativePath, entry))
  }

  private async nativeEventType(
    relativePath: string,
    nativeEvent: string,
  ): Promise<'created' | 'changed' | 'deleted'> {
    if (nativeEvent === 'change') return 'changed'

    const exists = await pathExists(this.paths, relativePath)
    if (!exists) return 'deleted'
    if (this.knownNativePaths.has(relativePath)) return 'changed'

    return 'created'
  }

  private recordNativeEventPath(relativePath: string, type: 'created' | 'changed' | 'deleted') {
    if (type === 'deleted') {
      this.knownNativePaths.delete(relativePath)
      return
    }

    this.knownNativePaths.add(relativePath)
  }

  private async *createStream(
    subscribed: Set<string>,
    signal: AbortSignal | undefined,
    listeners: Set<Listener>,
  ) {
    const queue: WatchServerMessage[] = [{ type: 'ready', root: '' }]
    const wake: WakeSlot = { current: null }

    const listener = (event: WatchServerMessage) => {
      if (!shouldDeliver(event, subscribed)) return

      queue.push(event)
      wake.current?.()
    }

    const abort = () => wake.current?.()
    let releases: WatchRelease[] = []
    listeners.add(listener)
    signal?.addEventListener('abort', abort)

    try {
      releases = await Promise.all(Array.from(subscribed).map((input) => this.retainWatcher(input)))

      yield* drainWatchQueue(queue, signal, wake)
    } finally {
      await releaseWatchers(releases)
      listeners.delete(listener)
      signal?.removeEventListener('abort', abort)
    }
  }

  private broadcast(event: WatchServerMessage) {
    this.broadcastTo(this.listeners, event)
    this.broadcastRaw(event)
  }

  private broadcastRaw(event: WatchServerMessage) {
    this.broadcastTo(this.rawListeners, event)
  }

  private broadcastRenamed(event: RenameWatchServerMessage) {
    const pathIgnored = isIgnoredPath(event.path)
    const oldPathIgnored = isIgnoredPath(event.oldPath)
    if (!pathIgnored && !oldPathIgnored) {
      this.broadcast(event)
      return
    }

    this.broadcastRaw(event)
    if (pathIgnored && oldPathIgnored) return
    if (pathIgnored) {
      this.broadcastTo(this.listeners, renamedDeleteEvent(event))
      return
    }

    this.broadcastTo(this.listeners, renamedCreateEvent(event))
  }

  private broadcastTo(listeners: Set<Listener>, event: WatchServerMessage) {
    for (const listener of listeners) listener(event)
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

function renamedCreateEvent(event: RenameWatchServerMessage): WatchServerMessage {
  return {
    entry: event.entry,
    origin: event.origin,
    path: event.path,
    sequence: event.sequence,
    type: 'created',
    version: event.version,
    writeId: event.writeId,
  }
}

function renamedDeleteEvent(event: RenameWatchServerMessage): WatchServerMessage {
  return {
    origin: event.origin,
    path: event.oldPath,
    sequence: event.sequence,
    type: 'deleted',
    version: event.version,
    writeId: event.writeId,
  }
}

async function* drainWatchQueue(
  queue: WatchServerMessage[],
  signal: AbortSignal | undefined,
  wake: WakeSlot,
) {
  while (!signal?.aborted) {
    const event = queue.shift()
    if (event) {
      yield event
      continue
    }

    await waitForWatchQueue(signal, wake)
  }
}

function waitForWatchQueue(signal: AbortSignal | undefined, wake: WakeSlot) {
  return new Promise<void>((resolve) => {
    const finish = () => {
      if (wake.current === finish) wake.current = null
      signal?.removeEventListener('abort', finish)
      resolve()
    }

    wake.current = finish
    signal?.addEventListener('abort', finish, { once: true })
    if (signal?.aborted) finish()
  })
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

function entryFromStat(stat: FileSystemEntryMetadata): TreeEntry {
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
