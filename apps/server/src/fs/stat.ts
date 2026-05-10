import type { Stats } from "node:fs"
import { lstat, stat } from "node:fs/promises"
import { FsError, mapNodeError } from "./errors"
import type { WorkspacePaths } from "./path"

export type FsEntryType = "file" | "directory" | "symlink" | "other"

export type FsEntryTypeCarrier = {
  type: FsEntryType
  targetType?: FsEntryType
}

export type FsStat = {
  path: string
  type: FsEntryType
  targetType?: FsEntryType
  size: number
  mtimeMs: number
  birthtimeMs: number
}

export type FsEntryStats = {
  displayStats: Stats
  targetStats: Stats
  type: FsEntryType
  targetType?: FsEntryType
}

export async function statPath(
  paths: WorkspacePaths,
  input: string
): Promise<FsStat> {
  const target = paths.resolve(input)

  try {
    const entryStats = await readEntryStats(target.absolutePath)

    return {
      path: target.relativePath,
      type: entryStats.type,
      targetType: entryStats.targetType,
      size: Number(entryStats.targetStats.size),
      mtimeMs: Number(entryStats.targetStats.mtimeMs),
      birthtimeMs: Number(entryStats.targetStats.birthtimeMs),
    }
  } catch (error) {
    if (error instanceof FsError) throw error
    throw mapNodeError(error)
  }
}

export async function lstatPath(paths: WorkspacePaths, input: string) {
  const target = paths.resolve(input)

  try {
    const stats = await lstat(target.absolutePath)
    return { target, stats }
  } catch (error) {
    throw mapNodeError(error)
  }
}

export async function readEntryStats(absolutePath: string) {
  const displayStats = await lstat(absolutePath)
  const type = typeFromStats(displayStats)
  if (!displayStats.isSymbolicLink()) {
    return {
      displayStats,
      targetStats: displayStats,
      type,
    } satisfies FsEntryStats
  }

  const targetStats = await statTargetOptional(absolutePath)
  if (!targetStats) {
    return {
      displayStats,
      targetStats: displayStats,
      type,
    } satisfies FsEntryStats
  }

  return {
    displayStats,
    targetStats,
    type,
    targetType: typeFromStats(targetStats),
  } satisfies FsEntryStats
}

export function typeFromStats(stats: Stats): FsEntryType {
  if (stats.isFile()) return "file"
  if (stats.isDirectory()) return "directory"
  if (stats.isSymbolicLink()) return "symlink"

  return "other"
}

export function effectiveEntryType(entry: FsEntryTypeCarrier): FsEntryType {
  return entry.targetType ?? entry.type
}

export function isDirectoryEntry(entry: FsEntryTypeCarrier) {
  return effectiveEntryType(entry) === "directory"
}

export function isFileEntry(entry: FsEntryTypeCarrier) {
  return effectiveEntryType(entry) === "file"
}

export function matchesEntryType(
  entry: FsEntryTypeCarrier,
  entryType?: FsEntryType
) {
  if (!entryType) return true
  if (entry.type === entryType) return true

  return entry.targetType === entryType
}

export function assertFile(stats: Stats) {
  if (stats.isFile()) return
  throw new FsError("NOT_A_FILE")
}

export function assertDirectory(stats: Stats) {
  if (stats.isDirectory()) return
  throw new FsError("NOT_A_DIRECTORY")
}

async function statTargetOptional(absolutePath: string) {
  try {
    return await stat(absolutePath)
  } catch {
    return null
  }
}
