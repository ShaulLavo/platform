import type { WorkspacePaths } from "./path"
import type { FileChangeHub } from "./watch"
import type { FsStat } from "./stat"
import type { TreeResult } from "./tree"
import type { ReadFileResult, BlobFileResult } from "./read"
import type { FindResult, FindStreamEvent } from "./search"
import type { FsMetadataEntry, FsMetadataStore } from "./metadata"
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

/**
 * Shape of the object returned by {@link FileSystem_Interface.info}.
 *
 * Mirrors the literal object composed inside `FileSystemService.info()` — the
 * service's own fields plus the shape of `FileChangeHub.info()` spread in.
 */
export type FileSystemInfo = {
  workspaceRoot: string
  systemRoot: string
  homePath: string
  defaultPath: string
  metadataDbPath: string
  maxTextFileBytes: number
  nativeWatcherCount: number
  watchEnabled: boolean
}

/**
 * Structural contract for the filesystem service.
 *
 * `FileSystem_Interface` declares every public method and property of the
 * concrete `FileSystemService` class (see `./service.ts`) with identical
 * names, parameters, and return types. Internal call sites inside
 * `apps/server/src/` hold values of this interface type rather than the
 * concrete class, so that the class remains replaceable and no call site
 * depends on private implementation details.
 *
 * Construction sites (`new FileSystemService(...)`) continue to reference the
 * concrete class. A compile-time assertion in `./service.ts` keeps the
 * interface and the class in sync: any new public member added to
 * `FileSystemService` that is not mirrored here will fail `turbo typecheck`.
 */
export interface FileSystem_Interface {
  readonly paths: WorkspacePaths
  readonly changes: FileChangeHub
  readonly homePath: string
  readonly systemRoot: string
  readonly defaultPath: string
  readonly metadata: FsMetadataStore

  info(): FileSystemInfo
  stat(path: string): Promise<FsStat>
  tree(
    path: string,
    depth: number,
    entryType?: EntryTypeFilter
  ): Promise<TreeResult>
  read(path: string): Promise<ReadFileResult>
  blob(path: string): Promise<BlobFileResult>
  write(body: WriteBody): Promise<FsStat>
  createFile(body: CreateFileBody): Promise<FsStat>
  createFolder(body: CreateFolderBody): Promise<FsStat>
  rename(body: RenameBody): Promise<FsStat>
  copy(body: CopyBody): Promise<FsStat>
  delete(body: DeleteBody): Promise<{ path: string; deleted: true }>
  find(
    path: string,
    query: string,
    limit: number,
    includeContent: boolean,
    entryType?: EntryTypeFilter,
    maxDepth?: number
  ): Promise<FindResult>
  findEvents(
    path: string,
    query: string,
    limit: number,
    includeContent: boolean,
    entryType?: EntryTypeFilter,
    maxDepth?: number,
    signal?: AbortSignal
  ): AsyncGenerator<FindStreamEvent>
  recents(limit: number): Promise<{ entries: FsMetadataEntry[] }>
  recordRecent(path: string): Promise<FsMetadataEntry>
  events(
    paths: string[],
    signal?: AbortSignal
  ): AsyncGenerator<WatchServerMessage>
  close(): void
}
