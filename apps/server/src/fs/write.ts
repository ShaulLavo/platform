import { randomUUID } from 'node:crypto'
import type { Stats } from 'node:fs'
import { chmod, open, readFile, realpath, rm, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { FsError, mapNodeError } from './errors'
import { lstatOptional, statOptional } from './mutation-target'
import type { WorkspacePaths } from './path'
import { assertFile } from './stat'
import type { WriteBody } from './contracts'
import { fileVersion, textFileVersion } from './version'

export async function writeTextFile(paths: WorkspacePaths, body: WriteBody) {
  const target = paths.resolve(body.path)
  let tempPath: string | null = null

  try {
    const writePath = await writablePath(target.absolutePath)
    tempPath = temporaryPath(writePath)
    const existing = await assertWritableTarget(writePath, {
      baseVersion: body.baseVersion,
      expectedMtimeMs: body.expectedMtimeMs,
    })
    await writeFile(tempPath, body.content, 'utf8')
    if (existing) await chmod(tempPath, existing.mode)
    await syncPath(tempPath)
    await rename(tempPath, writePath)
    await syncPath(path.dirname(writePath))
    return target.relativePath
  } catch (error) {
    await removeTempFile(tempPath)
    if (error instanceof FsError) throw error
    throw mapNodeError(error)
  }
}

async function assertWritableTarget(
  absolutePath: string,
  expected: { baseVersion?: string; expectedMtimeMs?: number },
) {
  const stats = await statOptional(absolutePath)
  if (!stats) {
    if (expected.baseVersion !== undefined) throw new FsError('FILE_CHANGED')
    return null
  }

  assertFile(stats)
  if (expected.baseVersion !== undefined) {
    const currentVersion = await targetVersion(absolutePath, stats, expected.baseVersion)
    if (currentVersion !== expected.baseVersion) throw new FsError('FILE_CHANGED')
  }
  if (expected.expectedMtimeMs === undefined) return stats
  if (Math.abs(stats.mtimeMs - expected.expectedMtimeMs) <= 1) return stats

  throw new FsError('FILE_CHANGED')
}

async function syncPath(target: string) {
  const handle = await open(target, 'r')
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function targetVersion(absolutePath: string, stats: Stats, baseVersion: string) {
  if (!baseVersion.startsWith('sha256:')) return fileVersion(stats)

  return textFileVersion(await readFile(absolutePath, 'utf8'))
}

async function writablePath(absolutePath: string) {
  const stats = await lstatOptional(absolutePath)
  if (!stats?.isSymbolicLink()) return absolutePath

  return realpath(absolutePath)
}

function temporaryPath(absolutePath: string) {
  return path.join(
    path.dirname(absolutePath),
    `.${path.basename(absolutePath)}.${randomUUID()}.tmp`,
  )
}

async function removeTempFile(tempPath: string | null) {
  if (!tempPath) return

  try {
    await rm(tempPath, { force: true })
  } catch {
    return
  }
}
