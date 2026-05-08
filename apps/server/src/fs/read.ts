import { readFile, stat } from "node:fs/promises"
import { FsError, mapNodeError } from "./errors"
import { assertExistingRealPathInside, type WorkspacePaths } from "./path"
import { assertFile } from "./stat"

export type ReadFileResult = {
  path: string
  content: string
  mtimeMs: number
  size: number
}

export type BlobFileResult = {
  absolutePath: string
  path: string
  mtimeMs: number
  size: number
}

export async function readTextFile(
  paths: WorkspacePaths,
  input: string
): Promise<ReadFileResult> {
  const target = paths.resolve(input)

  try {
    await assertExistingRealPathInside(paths, target.absolutePath)
    const stats = await stat(target.absolutePath)
    assertFile(stats)

    return {
      path: target.relativePath,
      content: await readFile(target.absolutePath, "utf8"),
      mtimeMs: stats.mtimeMs,
      size: stats.size,
    }
  } catch (error) {
    if (error instanceof FsError) throw error
    throw mapNodeError(error)
  }
}

export async function getBlobFile(
  paths: WorkspacePaths,
  input: string
): Promise<BlobFileResult> {
  const target = paths.resolve(input)

  try {
    await assertExistingRealPathInside(paths, target.absolutePath)
    const stats = await stat(target.absolutePath)
    assertFile(stats)

    return {
      absolutePath: target.absolutePath,
      path: target.relativePath,
      mtimeMs: stats.mtimeMs,
      size: stats.size,
    }
  } catch (error) {
    if (error instanceof FsError) throw error
    throw mapNodeError(error)
  }
}
