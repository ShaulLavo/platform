import { homedir } from 'node:os'
import path from 'node:path'
import { effectiveEntryType, type FileSystemEntryMetadata } from '@workspace/contracts'
import { createWorkspacePaths } from './path'
import { FileChangeHub } from './watch'
import { statPath } from './stat'
import { readTree } from './tree'
import { getBlobFile, readTextFile } from './read'
import { writeTextFile } from './write'
import { textFileVersion } from './version'
import { forgetAppSave, recordAppSave } from './app-save-marker'
import { createFile, createFolder } from './create'
import { renamePath } from './rename'
import { deletePath } from './delete'
import { copyPath } from './copy'
import {
  elapsedMs,
  errorSummary,
  observeRequestOperation,
  recordProcessWarning,
  recordRequestContext,
  recordRequestError,
  recordStreamSummary,
} from '../observability'
import { findInWorkspaceStream, type FindOptions, type SearchStreamEvent } from './search'
import { FsError } from './errors'
import type { MetadataDatabaseHandle } from '../db/client'
import { FsMetadataStore, metadataRowToEntry, type FsMetadataEntry } from './metadata'
import type {
  CopyBody,
  CreateFileBody,
  CreateFolderBody,
  DeleteBody,
  EntryTypeFilter,
  RenameBody,
  TreeEntry,
  WatchServerMessage,
  WriteBody,
} from './contracts'

export type FileSystemInfo = ReturnType<FileSystemService['info']>
export type FileSystemSearchOptions = Omit<FindOptions, 'maxContentBytes'>

export type FileSystemServiceOptions = {
  workspaceRoot?: string
  systemRoot?: string
  homeDirectory?: string
  watch?: boolean
  maxSearchContentBytes?: number
  maxTextFileBytes?: number
  treeConcurrency?: number
  /** Existing metadata database handle. When omitted the service opens and owns its own. */
  metadataDatabase?: MetadataDatabaseHandle
  /** Path for the service-owned metadata database when no handle is provided. */
  metadataDatabasePath?: string
}

export const DEFAULT_TREE_CONCURRENCY = 32

export const DEFAULT_MAX_TEXT_FILE_BYTES = 209_715_200

const MAX_TEXT_FILE_BYTES_UPPER_BOUND = 2_147_483_647

export function resolveMaxTextFileBytes(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.MAX_TEXT_FILE_BYTES
  if (raw === undefined) return DEFAULT_MAX_TEXT_FILE_BYTES

  const parsed = Number.parseInt(raw, 10)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_TEXT_FILE_BYTES_UPPER_BOUND) {
    recordProcessWarning('fs.invalid_max_text_file_bytes', {
      fallback: DEFAULT_MAX_TEXT_FILE_BYTES,
      max: MAX_TEXT_FILE_BYTES_UPPER_BOUND,
      value: raw,
    })
    return DEFAULT_MAX_TEXT_FILE_BYTES
  }

  return parsed
}

export class FileSystemService {
  readonly paths
  readonly changes
  readonly homePath
  readonly systemRoot
  readonly defaultPath
  readonly metadata
  private readonly maxSearchContentBytes
  private readonly maxTextFileBytes
  private readonly treeConcurrency

  constructor(options: FileSystemServiceOptions = {}) {
    const homeDirectory = options.homeDirectory ?? homedir()
    this.systemRoot = path.resolve(options.systemRoot ?? path.parse(homeDirectory).root)
    this.paths = createWorkspacePaths(options.workspaceRoot ?? this.systemRoot)
    this.homePath = resolveHomePath(this.paths, homeDirectory)
    this.defaultPath = this.homePath
    this.metadata = new FsMetadataStore({
      database: options.metadataDatabase,
      databasePath: options.metadataDatabasePath,
    })
    this.maxSearchContentBytes = options.maxSearchContentBytes ?? 1024 * 1024
    this.maxTextFileBytes = options.maxTextFileBytes ?? resolveMaxTextFileBytes()
    this.treeConcurrency = options.treeConcurrency ?? DEFAULT_TREE_CONCURRENCY
    this.changes = new FileChangeHub(this.paths, {
      enabled: options.watch ?? true,
    })
  }

  info() {
    return {
      workspaceRoot: this.paths.workspaceRoot,
      systemRoot: this.systemRoot,
      homePath: this.homePath,
      defaultPath: this.defaultPath,
      metadataDbPath: this.metadata.databasePath,
      maxTextFileBytes: this.maxTextFileBytes,
      ...this.changes.info(),
    }
  }

  stat(path: string) {
    return observeRequestOperation(
      { area: 'fs', operation: 'stat', path },
      () => statPath(this.paths, path),
      (result) => ({ entryType: result.type, size: result.size }),
    )
  }

  tree(path: string, depth: number, entryType?: EntryTypeFilter) {
    return observeRequestOperation(
      { area: 'fs', depth, entryType, operation: 'tree', path },
      () =>
        readTree(this.paths, path, depth, entryType, {
          concurrency: this.treeConcurrency,
        }),
      (result) => ({ entryCount: result.entries.length }),
    )
  }

  read(path: string) {
    return observeRequestOperation(
      { area: 'fs', operation: 'read', path },
      () => readTextFile(this.paths, path, this.maxTextFileBytes),
      (result) => ({ size: result.size }),
    )
  }

  blob(path: string) {
    return observeRequestOperation(
      { area: 'fs', operation: 'blob', path },
      () => getBlobFile(this.paths, path),
      (result) => ({ size: result.size }),
    )
  }

  async write(body: WriteBody) {
    return observeRequestOperation(
      {
        area: 'fs',
        contentBytes: Buffer.byteLength(body.content, 'utf8'),
        hasBaseVersion: body.baseVersion !== undefined,
        hasExpectedMtime: body.expectedMtimeMs !== undefined,
        operation: 'write',
        path: body.path,
        writeId: body.writeId,
      },
      () => this.writeObserved(body),
      (result) => ({ entryType: result.type, size: result.size }),
    )
  }

  private async writeObserved(body: WriteBody) {
    const target = this.paths.resolve(body.path)
    recordAppSave(target.absolutePath)

    let path: string
    try {
      path = await writeTextFile(this.paths, body)
    } catch (error) {
      forgetAppSave(target.absolutePath)
      throw error
    }

    const entry = {
      ...(await this.statEntry(path)),
      version: textFileVersion(body.content),
    }
    this.changes.emit({
      type: 'changed',
      path,
      entry,
      origin: body.origin,
      version: entry.version,
      writeId: body.writeId,
    })

    return {
      ...(await this.stat(path)),
      version: entry.version,
    }
  }

  async createFile(body: CreateFileBody) {
    return observeRequestOperation(
      {
        area: 'fs',
        contentBytes: body.content ? Buffer.byteLength(body.content, 'utf8') : 0,
        operation: 'create_file',
        path: body.path,
      },
      () => this.createFileObserved(body),
      (result) => ({ entryType: result.type, size: result.size }),
    )
  }

  private async createFileObserved(body: CreateFileBody) {
    const path = await createFile(this.paths, body)
    const entry = await this.statEntry(path)
    this.changes.emit({ type: 'created', path, entry })

    return this.stat(path)
  }

  async createFolder(body: CreateFolderBody) {
    return observeRequestOperation(
      {
        area: 'fs',
        operation: 'create_folder',
        path: body.path,
        recursive: body.recursive,
      },
      () => this.createFolderObserved(body),
      (result) => ({ entryType: result.type }),
    )
  }

  private async createFolderObserved(body: CreateFolderBody) {
    const path = await createFolder(this.paths, body)
    const entry = await this.statEntry(path)
    this.changes.emit({ type: 'created', path, entry })

    return this.stat(path)
  }

  async rename(body: RenameBody) {
    return observeRequestOperation(
      {
        area: 'fs',
        from: body.from,
        operation: 'rename',
        path: body.to,
      },
      () => this.renameObserved(body),
      (result) => ({ entryType: result.type, size: result.size }),
    )
  }

  private async renameObserved(body: RenameBody) {
    const result = await renamePath(this.paths, body)
    const entry = await this.statEntry(result.to)
    this.changes.emit({
      entry,
      type: 'renamed',
      oldPath: result.from,
      path: result.to,
    })

    return this.stat(result.to)
  }

  async copy(body: CopyBody) {
    return observeRequestOperation(
      {
        area: 'fs',
        from: body.from,
        operation: 'copy',
        path: body.to,
      },
      () => this.copyObserved(body),
      (result) => ({ entryType: result.type, size: result.size }),
    )
  }

  private async copyObserved(body: CopyBody) {
    const result = await copyPath(this.paths, body)
    const entry = await this.statEntry(result.to)
    this.changes.emit({ type: 'created', path: result.to, entry })

    return this.stat(result.to)
  }

  async delete(body: DeleteBody) {
    return observeRequestOperation(
      { area: 'fs', operation: 'delete', path: body.path },
      () => this.deleteObserved(body),
      (result) => ({ deleted: result.deleted }),
    )
  }

  private async deleteObserved(body: DeleteBody) {
    const path = await deletePath(this.paths, body)
    this.changes.emit({ type: 'deleted', path })

    return { path, deleted: true as const }
  }

  async *searchEvents(
    options: FileSystemSearchOptions,
    signal?: AbortSignal,
  ): AsyncGenerator<SearchStreamEvent> {
    yield* observedSearchEvents(
      findInWorkspaceStream(
        this.paths,
        {
          ...options,
          maxContentBytes: this.maxSearchContentBytes,
        },
        signal,
      ),
      options,
    )
  }

  async recents(limit: number) {
    return observeRequestOperation(
      { area: 'fs', limit, operation: 'recents' },
      () => this.recentsObserved(limit),
      (result) => ({ entryCount: result.entries.length }),
    )
  }

  private async recentsObserved(limit: number) {
    const rows = this.metadata.listRecentDirectories(limit)
    const entries: FsMetadataEntry[] = []

    for (const row of rows) {
      const entry = await this.refreshMetadataEntry(metadataRowToEntry(row))
      if (!entry) continue
      entries.push(entry)
    }

    return { entries }
  }

  async recordRecent(path: string) {
    return observeRequestOperation(
      { area: 'fs', operation: 'record_recent', path },
      () => this.recordRecentObserved(path),
      (result) => ({ entryType: result.type }),
    )
  }

  private async recordRecentObserved(path: string) {
    const entry = await this.metadataEntry(path)
    if (effectiveEntryType(entry) !== 'directory') throw new FsError('NOT_A_DIRECTORY')

    this.metadata.recordPicked(entry)
    return entry
  }

  async *events(paths: string[], signal?: AbortSignal): AsyncGenerator<WatchServerMessage> {
    yield* observedWatchEvents(this.changes.stream(paths, signal), paths)
  }

  async close() {
    await this.changes.close()
    this.metadata.close()
  }

  private async refreshMetadataEntry(entry: FsMetadataEntry) {
    try {
      const refreshed = await this.metadataEntry(entry.path)
      if (effectiveEntryType(refreshed) !== 'directory') return null
      return refreshed
    } catch {
      return null
    }
  }

  private async metadataEntry(input: string): Promise<FsMetadataEntry> {
    const stat = await this.stat(input)

    return {
      ...entryFromStat(stat),
    }
  }

  private async statEntry(input: string): Promise<TreeEntry> {
    const stat = await this.stat(input)
    return entryFromStat(stat)
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

async function* observedSearchEvents(
  events: AsyncGenerator<SearchStreamEvent>,
  options: FileSystemSearchOptions,
) {
  const startedAt = performance.now()
  const state = {
    completed: false,
    matchCount: 0,
    truncated: false,
  }
  recordRequestContext({
    area: 'fs',
    operation: 'search_events',
    search: {
      includeContent: options.includeContent,
      includeNames: options.includeNames,
      limit: options.limit,
      matchMode: options.matchMode,
      queryLength: options.query.length,
    },
  })

  try {
    for await (const event of events) {
      updateSearchState(state, event)
      yield event
    }
  } catch (error) {
    recordRequestError(error, searchStreamSummary(options, startedAt, state, 'error'))
    recordStreamSummary({
      ...searchStreamSummary(options, startedAt, state, 'error'),
      error: errorSummary(error),
    })
    throw error
  }

  recordStreamSummary(searchStreamSummary(options, startedAt, state, 'ok'))
}

async function* observedWatchEvents(
  events: AsyncGenerator<WatchServerMessage>,
  paths: readonly string[],
) {
  const startedAt = performance.now()
  const state = {
    deliveredCount: 0,
    errorEventCount: 0,
  }
  recordRequestContext({
    area: 'fs',
    operation: 'watch_events',
    watch: {
      subscribedRootCount: paths.length || 1,
    },
  })

  try {
    for await (const event of events) {
      updateWatchState(state, event)
      yield event
    }
  } catch (error) {
    recordRequestError(error, watchStreamSummary(paths, startedAt, state, 'error'))
    recordStreamSummary({
      ...watchStreamSummary(paths, startedAt, state, 'error'),
      error: errorSummary(error),
    })
    throw error
  }

  recordStreamSummary(watchStreamSummary(paths, startedAt, state, 'ok'))
}

function updateSearchState(
  state: {
    completed: boolean
    matchCount: number
    truncated: boolean
  },
  event: SearchStreamEvent,
) {
  if (event.type === 'match') {
    state.matchCount += 1
    return
  }

  state.completed = true
  state.matchCount = event.count
  state.truncated = event.truncated
}

function updateWatchState(
  state: {
    deliveredCount: number
    errorEventCount: number
  },
  event: WatchServerMessage,
) {
  state.deliveredCount += 1
  if (event.type === 'error') state.errorEventCount += 1
}

function searchStreamSummary(
  options: FileSystemSearchOptions,
  startedAt: number,
  state: {
    completed: boolean
    matchCount: number
    truncated: boolean
  },
  status: 'error' | 'ok',
) {
  return {
    area: 'fs',
    completed: state.completed,
    durationMs: elapsedMs(startedAt),
    limit: options.limit,
    matchCount: state.matchCount,
    operation: 'search_events',
    path: options.path,
    search: {
      matchCount: state.matchCount,
      queryLength: options.query.length,
      truncated: state.truncated,
    },
    status,
    truncated: state.truncated,
  }
}

function watchStreamSummary(
  paths: readonly string[],
  startedAt: number,
  state: {
    deliveredCount: number
    errorEventCount: number
  },
  status: 'error' | 'ok',
) {
  return {
    area: 'fs',
    deliveredCount: state.deliveredCount,
    durationMs: elapsedMs(startedAt),
    errorEventCount: state.errorEventCount,
    operation: 'watch_events',
    status,
    subscribedRootCount: paths.length || 1,
  }
}

function resolveHomePath(paths: ReturnType<typeof createWorkspacePaths>, homeDirectory: string) {
  const absoluteHome = path.resolve(homeDirectory)

  try {
    paths.assertInside(absoluteHome)
    return paths.toRelative(absoluteHome)
  } catch {
    return ''
  }
}

function pathBasename(input: string) {
  const parts = input.split('/').filter(Boolean)
  return parts.at(-1) ?? 'Root'
}
