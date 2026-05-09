import { homedir } from "node:os"
import path from "node:path"
import { createWorkspacePaths } from "./path"
import { FileChangeHub } from "./watch"
import { statPath } from "./stat"
import { readTree } from "./tree"
import { getBlobFile, readTextFile } from "./read"
import { writeTextFile } from "./write"
import { createFile, createFolder } from "./create"
import { renamePath } from "./rename"
import { deletePath } from "./delete"
import { copyPath } from "./copy"
import {
  findInWorkspace,
  findInWorkspaceStream,
  type FindStreamEvent,
} from "./search"
import { FsError } from "./errors"
import {
  FsMetadataStore,
  metadataRowToEntry,
  type FsMetadataEntry,
} from "./metadata"
import type { FsStat } from "./stat"
import type {
  CopyBody,
  CreateFileBody,
  CreateFolderBody,
  DeleteBody,
  EntryTypeFilter,
  RenameBody,
  TreeEntryLike,
  WatchServerMessage,
  WriteBody,
} from "./contracts"
import type { FileSystem_Interface } from "./file-system-interface"

export type FileSystemServiceOptions = {
  workspaceRoot?: string
  systemRoot?: string
  homeDirectory?: string
  watch?: boolean
  maxSearchContentBytes?: number
  maxTextFileBytes?: number
  treeConcurrency?: number
}

export const DEFAULT_TREE_CONCURRENCY = 32

/**
 * Maximum bytes a single text file is permitted to occupy when loaded in full
 * via {@link FileSystemService.read}.
 *
 * Unit: bytes. Value: 209_715_200 (200 MiB).
 *
 * Rationale: 200 MiB caps pathological whole-file loads without blocking
 * typical source files; chunked reads are the long-term fix.
 *
 * Override mechanism: set the `MAX_TEXT_FILE_BYTES` environment variable to an
 * integer in the inclusive range `[1, 2_147_483_647]` to raise or lower the
 * cap at runtime (see {@link resolveMaxTextFileBytes}). Values that are not
 * integers, are below 1, or exceed `2_147_483_647` are rejected; the server
 * logs the rejection through its standard error reporting path and falls back
 * to this default.
 */
export const DEFAULT_MAX_TEXT_FILE_BYTES = 209_715_200

/** Inclusive upper bound for `MAX_TEXT_FILE_BYTES` (max signed 32-bit int). */
const MAX_TEXT_FILE_BYTES_UPPER_BOUND = 2_147_483_647

/**
 * Resolve the effective maximum text-file size in bytes.
 *
 * Reads `env.MAX_TEXT_FILE_BYTES` and returns:
 * - {@link DEFAULT_MAX_TEXT_FILE_BYTES} when the variable is unset.
 * - the parsed integer when it parses as a base-10 integer in the inclusive
 *   range `[1, 2_147_483_647]`.
 * - {@link DEFAULT_MAX_TEXT_FILE_BYTES} otherwise, after reporting the
 *   rejection via the server's standard error reporting path.
 */
export function resolveMaxTextFileBytes(
  env: NodeJS.ProcessEnv = process.env
): number {
  const raw = env.MAX_TEXT_FILE_BYTES
  if (raw === undefined) return DEFAULT_MAX_TEXT_FILE_BYTES

  const parsed = Number.parseInt(raw, 10)
  if (
    !Number.isInteger(parsed) ||
    parsed < 1 ||
    parsed > MAX_TEXT_FILE_BYTES_UPPER_BOUND
  ) {
    console.error(
      `[fs] Ignoring invalid MAX_TEXT_FILE_BYTES=${JSON.stringify(raw)}: ` +
        `expected integer in [1, ${MAX_TEXT_FILE_BYTES_UPPER_BOUND}]. ` +
        `Falling back to DEFAULT_MAX_TEXT_FILE_BYTES=${DEFAULT_MAX_TEXT_FILE_BYTES}.`
    )
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
    this.systemRoot = path.resolve(
      options.systemRoot ?? path.parse(homeDirectory).root
    )
    this.paths = createWorkspacePaths(options.workspaceRoot ?? this.systemRoot)
    this.homePath = resolveHomePath(this.paths, homeDirectory)
    this.defaultPath = this.homePath
    this.metadata = new FsMetadataStore()
    this.maxSearchContentBytes = options.maxSearchContentBytes ?? 1024 * 1024
    this.maxTextFileBytes =
      options.maxTextFileBytes ?? resolveMaxTextFileBytes()
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
    return statPath(this.paths, path)
  }

  tree(path: string, depth: number, entryType?: EntryTypeFilter) {
    return readTree(this.paths, path, depth, entryType, {
      concurrency: this.treeConcurrency,
    })
  }

  read(path: string) {
    return readTextFile(this.paths, path, this.maxTextFileBytes)
  }

  blob(path: string) {
    return getBlobFile(this.paths, path)
  }

  async write(body: WriteBody) {
    const path = await writeTextFile(this.paths, body)
    const entry = await this.statEntry(path)
    this.changes.emit({ type: "changed", path, entry })

    return this.stat(path)
  }

  async createFile(body: CreateFileBody) {
    const path = await createFile(this.paths, body)
    const entry = await this.statEntry(path)
    this.changes.emit({ type: "created", path, entry })

    return this.stat(path)
  }

  async createFolder(body: CreateFolderBody) {
    const path = await createFolder(this.paths, body)
    const entry = await this.statEntry(path)
    this.changes.emit({ type: "created", path, entry })

    return this.stat(path)
  }

  async rename(body: RenameBody) {
    const result = await renamePath(this.paths, body)
    const entry = await this.statEntry(result.to)
    this.changes.emit({
      entry,
      type: "renamed",
      oldPath: result.from,
      path: result.to,
    })

    return this.stat(result.to)
  }

  async copy(body: CopyBody) {
    const result = await copyPath(this.paths, body)
    const entry = await this.statEntry(result.to)
    this.changes.emit({ type: "created", path: result.to, entry })

    return this.stat(result.to)
  }

  async delete(body: DeleteBody) {
    const path = await deletePath(this.paths, body)
    this.changes.emit({ type: "deleted", path })

    return { path, deleted: true as const }
  }

  find(
    path: string,
    query: string,
    limit: number,
    includeContent: boolean,
    entryType?: EntryTypeFilter,
    maxDepth?: number
  ) {
    return findInWorkspace(this.paths, {
      path,
      query,
      limit,
      includeContent,
      entryType,
      maxDepth,
      maxContentBytes: this.maxSearchContentBytes,
    })
  }

  findEvents(
    path: string,
    query: string,
    limit: number,
    includeContent: boolean,
    entryType?: EntryTypeFilter,
    maxDepth?: number,
    signal?: AbortSignal
  ): AsyncGenerator<FindStreamEvent> {
    return findInWorkspaceStream(
      this.paths,
      {
        path,
        query,
        limit,
        includeContent,
        entryType,
        maxDepth,
        maxContentBytes: this.maxSearchContentBytes,
      },
      signal
    )
  }

  async recents(limit: number) {
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
    const entry = await this.metadataEntry(path)
    if (entry.type !== "directory") throw new FsError("NOT_A_DIRECTORY")

    this.metadata.recordPicked(entry)
    return entry
  }

  events(
    paths: string[],
    signal?: AbortSignal
  ): AsyncGenerator<WatchServerMessage> {
    return this.changes.stream(paths, signal)
  }

  close() {
    this.changes.close()
    this.metadata.close()
  }

  private async refreshMetadataEntry(entry: FsMetadataEntry) {
    try {
      const refreshed = await this.metadataEntry(entry.path)
      if (refreshed.type !== "directory") return null
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

  private async statEntry(input: string): Promise<TreeEntryLike> {
    const stat = await this.stat(input)
    return entryFromStat(stat)
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

function resolveHomePath(
  paths: ReturnType<typeof createWorkspacePaths>,
  homeDirectory: string
) {
  const absoluteHome = path.resolve(homeDirectory)

  try {
    paths.assertInside(absoluteHome)
    return paths.toRelative(absoluteHome)
  } catch {
    return ""
  }
}

function pathBasename(input: string) {
  const parts = input.split("/").filter(Boolean)
  return parts.at(-1) ?? "Root"
}

const _assertImplements: FileSystem_Interface = {} as FileSystemService
type _MissingOnInterface = Exclude<
  keyof FileSystemService,
  keyof FileSystem_Interface
>
const _requireEmpty: _MissingOnInterface extends never ? true : never = true
void _assertImplements
void _requireEmpty
