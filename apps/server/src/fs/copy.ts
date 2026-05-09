import { cp, rm } from "node:fs/promises"
import { FsError, mapNodeError } from "./errors"
import {
  assertExistingRealPathInside,
  assertParentRealPathInside,
  type WorkspacePaths,
} from "./path"
import type { CopyBody } from "./contracts"

export async function copyPath(paths: WorkspacePaths, body: CopyBody) {
  const from = paths.resolve(body.from)
  const to = paths.resolve(body.to)

  try {
    assertNotRoot(to.relativePath)
    await assertExistingRealPathInside(paths, from.absolutePath)
    await assertParentRealPathInside(paths, to.absolutePath)
    await removeDestinationIfAllowed(paths, to.absolutePath, body.overwrite)
    await cp(from.absolutePath, to.absolutePath, {
      recursive: Boolean(body.recursive),
      errorOnExist: !body.overwrite,
      force: Boolean(body.overwrite),
    })

    return {
      from: from.relativePath,
      to: to.relativePath,
    }
  } catch (error) {
    if (error instanceof FsError) throw error
    throw mapNodeError(error)
  }
}

async function removeDestinationIfAllowed(
  paths: WorkspacePaths,
  absolutePath: string,
  overwrite?: boolean
) {
  const exists = await destinationExists(paths, absolutePath)
  if (!exists) return
  if (!overwrite) throw new FsError("ALREADY_EXISTS")

  await rm(absolutePath, { recursive: true, force: false })
}

async function destinationExists(paths: WorkspacePaths, absolutePath: string) {
  try {
    await assertExistingRealPathInside(paths, absolutePath)
    return true
  } catch (error) {
    if (nodeErrorCode(error) === "ENOENT") return false
    throw error
  }
}

function assertNotRoot(relativePath: string) {
  if (relativePath) return
  throw new FsError(
    "INVALID_PATH",
    "operation cannot target the workspace root"
  )
}

function nodeErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return null
  if (!("code" in error)) return null

  const code = error.code
  return typeof code === "string" ? code : null
}
