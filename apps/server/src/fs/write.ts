import { randomUUID } from "node:crypto"
import { lstat, realpath, rm, rename, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { FsError, mapNodeError } from "./errors"
import type { WorkspacePaths } from "./path"
import { assertFile } from "./stat"
import type { WriteBody } from "./contracts"

export async function writeTextFile(paths: WorkspacePaths, body: WriteBody) {
  const target = paths.resolve(body.path)
  let tempPath: string | null = null

  try {
    const writePath = await writablePath(target.absolutePath)
    tempPath = temporaryPath(writePath)
    await assertWritableTarget(writePath, body.expectedMtimeMs)
    await writeFile(tempPath, body.content, "utf8")
    await rename(tempPath, writePath)
    return target.relativePath
  } catch (error) {
    await removeTempFile(tempPath)
    if (error instanceof FsError) throw error
    throw mapNodeError(error)
  }
}

async function assertWritableTarget(
  absolutePath: string,
  expectedMtimeMs?: number
) {
  const stats = await statOptional(absolutePath)
  if (!stats) return

  assertFile(stats)
  if (expectedMtimeMs === undefined) return
  if (Math.abs(stats.mtimeMs - expectedMtimeMs) <= 1) return

  throw new FsError("FILE_CHANGED")
}

async function writablePath(absolutePath: string) {
  const stats = await lstatOptional(absolutePath)
  if (!stats?.isSymbolicLink()) return absolutePath

  return realpath(absolutePath)
}

async function lstatOptional(absolutePath: string) {
  try {
    return await lstat(absolutePath)
  } catch (error) {
    if (nodeErrorCode(error) === "ENOENT") return null
    throw error
  }
}

async function statOptional(absolutePath: string) {
  try {
    return await stat(absolutePath)
  } catch (error) {
    if (nodeErrorCode(error) === "ENOENT") return null
    throw error
  }
}

function temporaryPath(absolutePath: string) {
  return path.join(
    path.dirname(absolutePath),
    `.${path.basename(absolutePath)}.${randomUUID()}.tmp`
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

function nodeErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return null
  if (!("code" in error)) return null

  const code = error.code
  return typeof code === "string" ? code : null
}
