import { readdir, stat } from "node:fs/promises"
import path from "node:path"
import { FsError, mapNodeError } from "./errors"
import {
  isIgnoredPath,
  treeIgnoredNames,
  toPosix,
  type WorkspacePaths,
} from "./path"
import {
  assertDirectory,
  effectiveEntryType,
  isDirectoryEntry,
  matchesEntryType,
  readEntryStats,
  type FsEntryType,
} from "./stat"
import type { EntryTypeFilter } from "./contracts"

export type TreeEntry = {
  name: string
  path: string
  type: FsEntryType
  targetType?: FsEntryType
  size: number
  mtimeMs: number
  birthtimeMs: number
  children?: TreeEntry[]
}

export type TreeResult = {
  path: string
  entries: TreeEntry[]
}

export type TreeReadOptions = {
  concurrency?: number
}

type TaskLimiter = <T>(task: () => Promise<T>) => Promise<T>

export async function readTree(
  paths: WorkspacePaths,
  input: string,
  depth = 1,
  entryType?: EntryTypeFilter,
  options: TreeReadOptions = {}
): Promise<TreeResult> {
  const target = paths.resolve(input)
  const limit = createTaskLimiter(options.concurrency ?? 32)

  try {
    const stats = await stat(target.absolutePath)
    assertDirectory(stats)

    return {
      path: target.relativePath,
      entries: await readEntries(
        paths,
        target.absolutePath,
        target.relativePath,
        depth,
        entryType,
        limit
      ),
    }
  } catch (error) {
    if (error instanceof FsError) throw error
    throw mapNodeError(error)
  }
}

async function readEntries(
  paths: WorkspacePaths,
  absoluteDirectory: string,
  relativeDirectory: string,
  depth: number,
  entryType: EntryTypeFilter | undefined,
  limit: TaskLimiter
) {
  const dirents = await readdir(absoluteDirectory, { withFileTypes: true })
  const entries = await Promise.all(
    dirents.map((dirent) =>
      readEntry(
        paths,
        absoluteDirectory,
        relativeDirectory,
        dirent.name,
        depth,
        entryType,
        limit
      )
    )
  )

  return entries.filter(isTreeEntry).sort(compareTreeEntries)
}

async function readEntry(
  paths: WorkspacePaths,
  absoluteDirectory: string,
  relativeDirectory: string,
  name: string,
  depth: number,
  entryType: EntryTypeFilter | undefined,
  limit: TaskLimiter
) {
  const entry = await limit(() =>
    readEntryMetadata(absoluteDirectory, relativeDirectory, name)
  )
  if (!entry) return null

  if (!isDirectoryEntry(entry)) return matchingEntry(entry, entryType)
  if (depth <= 1) return matchingEntry(entry, entryType)

  entry.children = await readEntries(
    paths,
    path.join(absoluteDirectory, name),
    entry.path,
    depth - 1,
    entryType,
    limit
  )
  return matchingEntry(entry, entryType)
}

async function readEntryMetadata(
  absoluteDirectory: string,
  relativeDirectory: string,
  name: string
): Promise<TreeEntry | null> {
  const relativePath = joinRelative(relativeDirectory, name)
  if (isIgnoredPath(relativePath, treeIgnoredNames)) return null

  const absolutePath = path.join(absoluteDirectory, name)
  const entryStats = await safeEntryStats(absolutePath)
  if (!entryStats) return null

  return {
    name,
    path: relativePath,
    type: entryStats.type,
    targetType: entryStats.targetType,
    size: entryStats.targetStats.size,
    mtimeMs: entryStats.targetStats.mtimeMs,
    birthtimeMs: entryStats.targetStats.birthtimeMs,
  } satisfies TreeEntry
}

async function safeEntryStats(absolutePath: string) {
  try {
    return await readEntryStats(absolutePath)
  } catch {
    return null
  }
}

function createTaskLimiter(concurrency: number): TaskLimiter {
  const max = Math.max(1, Math.floor(concurrency))
  const queue: Array<() => void> = []
  let active = 0

  return async (task) => {
    if (active >= max) await new Promise<void>((resolve) => queue.push(resolve))
    active += 1

    try {
      return await task()
    } finally {
      active -= 1
      queue.shift()?.()
    }
  }
}

function joinRelative(parent: string, child: string) {
  if (!parent) return child
  return toPosix(path.join(parent, child))
}

function compareTreeEntries(a: TreeEntry, b: TreeEntry) {
  const aType = effectiveEntryType(a)
  const bType = effectiveEntryType(b)
  if (aType === "directory" && bType !== "directory") return -1
  if (aType !== "directory" && bType === "directory") return 1

  if (a.name < b.name) return -1
  if (a.name > b.name) return 1
  return 0
}

function matchingEntry(entry: TreeEntry, entryType?: EntryTypeFilter) {
  if (matchesEntryType(entry, entryType)) return entry

  return null
}

function isTreeEntry(entry: TreeEntry | null): entry is TreeEntry {
  return entry !== null
}
