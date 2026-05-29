import { readFile, stat } from 'node:fs/promises'
import { FsError, mapNodeError } from './errors'
import type { WorkspacePaths } from './path'
import { assertFile } from './stat'
import { fileVersion, textFileVersion } from './version'

export type ReadFileResult = {
  path: string
  content: string
  mtimeMs: number
  size: number
  version: string
}

export type BlobFileResult = {
  absolutePath: string
  path: string
  mtimeMs: number
  size: number
  version: string
}

export async function readTextFile(
  paths: WorkspacePaths,
  input: string,
  maxBytes: number,
): Promise<ReadFileResult> {
  const target = paths.resolve(input)

  try {
    const stats = await stat(target.absolutePath)
    assertFile(stats)
    if (stats.size > maxBytes) throw new FsError('FILE_TOO_LARGE')
    const content = await readFile(target.absolutePath, 'utf8')

    return {
      path: target.relativePath,
      content,
      mtimeMs: stats.mtimeMs,
      size: stats.size,
      version: textFileVersion(content),
    }
  } catch (error) {
    if (error instanceof FsError) throw error
    throw mapNodeError(error)
  }
}

export async function getBlobFile(paths: WorkspacePaths, input: string): Promise<BlobFileResult> {
  const target = paths.resolve(input)

  try {
    const stats = await stat(target.absolutePath)
    assertFile(stats)

    return {
      absolutePath: target.absolutePath,
      path: target.relativePath,
      mtimeMs: stats.mtimeMs,
      size: stats.size,
      version: fileVersion(stats),
    }
  } catch (error) {
    if (error instanceof FsError) throw error
    throw mapNodeError(error)
  }
}
