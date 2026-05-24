import { lstat, rm, rename } from 'node:fs/promises'
import { FsError, mapNodeError } from './errors'
import type { WorkspacePaths } from './path'
import type { RenameBody } from './contracts'

export async function renamePath(paths: WorkspacePaths, body: RenameBody) {
  const from = paths.resolve(body.from)
  const to = paths.resolve(body.to)

  try {
    assertNotRoot(from.relativePath)
    assertNotRoot(to.relativePath)
    await assertExistingPath(from.absolutePath)
    await removeDestinationIfAllowed(to.absolutePath, body.overwrite)
    await rename(from.absolutePath, to.absolutePath)

    return {
      from: from.relativePath,
      to: to.relativePath,
    }
  } catch (error) {
    if (error instanceof FsError) throw error
    throw mapNodeError(error)
  }
}

async function removeDestinationIfAllowed(absolutePath: string, overwrite?: boolean) {
  const exists = await destinationExists(absolutePath)
  if (!exists) return
  if (!overwrite) throw new FsError('ALREADY_EXISTS')

  await rm(absolutePath, { recursive: true, force: false })
}

async function assertExistingPath(absolutePath: string) {
  await lstat(absolutePath)
}

async function destinationExists(absolutePath: string) {
  try {
    await lstat(absolutePath)
    return true
  } catch (error) {
    if (nodeErrorCode(error) === 'ENOENT') return false
    throw error
  }
}

function assertNotRoot(relativePath: string) {
  if (relativePath) return
  throw new FsError('INVALID_PATH', 'operation cannot target the workspace root')
}

function nodeErrorCode(error: unknown) {
  if (!error || typeof error !== 'object') return null
  if (!('code' in error)) return null

  const code = error.code
  return typeof code === 'string' ? code : null
}
