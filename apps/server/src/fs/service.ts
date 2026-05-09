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
import type {
  CopyBody,
  CreateFileBody,
  CreateFolderBody,
  DeleteBody,
  EntryTypeFilter,
  RenameBody,
  WatchServerMessage,
  WriteBody,
} from "./contracts"

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
// Dev-only until chunked file reads land. Launch builds must lower this cap or
// replace whole-file reads with metadata-first, chunked text loading.
export const DEFAULT_MAX_TEXT_FILE_BYTES = 200 * 1024 * 1024

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
      options.maxTextFileBytes ?? DEFAULT_MAX_TEXT_FILE_BYTES
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
    this.changes.emit({ type: "changed", path })

    return this.stat(path)
  }

  async createFile(body: CreateFileBody) {
    const path = await createFile(this.paths, body)
    this.changes.emit({ type: "created", path })

    return this.stat(path)
  }

  async createFolder(body: CreateFolderBody) {
    const path = await createFolder(this.paths, body)
    this.changes.emit({ type: "created", path })

    return this.stat(path)
  }

  async rename(body: RenameBody) {
    const result = await renamePath(this.paths, body)
    this.changes.emit({
      type: "renamed",
      oldPath: result.from,
      path: result.to,
    })

    return this.stat(result.to)
  }

  async copy(body: CopyBody) {
    const result = await copyPath(this.paths, body)
    this.changes.emit({ type: "created", path: result.to })

    return this.stat(result.to)
  }

  async delete(body: DeleteBody) {
    const path = await deletePath(this.paths, body)
    this.changes.emit({ type: "deleted", path })

    return { path, deleted: true }
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
      path: stat.path,
      name: pathBasename(stat.path),
      type: stat.type,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      birthtimeMs: stat.birthtimeMs,
    }
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
