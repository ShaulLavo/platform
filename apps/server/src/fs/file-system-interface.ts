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
